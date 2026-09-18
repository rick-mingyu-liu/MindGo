import OpenAI from 'openai';
import config = require('../config');

// OpenAI refusing for account reasons rather than failing: no credit left
// (measured 2026-09-17: 429 credit_balance_exhausted), no quota, or throttled.
const UNAVAILABLE_CODES = ['credit_balance_exhausted', 'insufficient_quota', 'rate_limit_exceeded'];

/** Thrown when OpenAI will not answer for now; the controller maps it to 503. */
class AiUnavailableError extends Error {
  constructor(cause: unknown) {
    super('AI service temporarily unavailable', { cause });
    this.name = 'AiUnavailableError';
  }
}

/**
 * The one method this module calls on an OpenAI client, declared
 * structurally rather than as `OpenAI` itself. A real `OpenAI` instance has
 * far more surface than this and still satisfies it; so does the fake client
 * `test/aiUnavailable.test.ts` swaps in
 * (`{ chat: { completions: { create: async () => { throw failWith; } } } }`).
 * Typing `openai` as `OpenAI | null` would reject that fake, even though it
 * works fine at runtime.
 */
interface ChatCompletionsClient {
  chat: {
    completions: {
      // params is `unknown`, not the request shape this module actually
      // sends: the real OpenAI client's create() takes a large discriminated
      // union of message-param variants, and a looser object type here is
      // not assignable to it under normal (contravariant) parameter
      // checking, which real `OpenAI` instances must satisfy to be assigned
      // to `openai` below. The request body is never read back out of this
      // interface, only constructed at the call site, so nothing is lost by
      // leaving it unchecked here.
      create(params: unknown): Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

interface FormData {
  currentIncome?: number;
  currentExpenses?: number;
  timeline?: string;
  currency?: string;
  additionalContext?: string;
}

interface GoalSummary {
  name: string;
  // savings_goals.current_amount/target_amount are DECIMAL columns and
  // arrive as strings (current_amount is nullable -- no NOT NULL, just a
  // DEFAULT 0 -- so its type carries that too; target_amount is NOT NULL).
  // This interface only ever interpolates them into a template literal
  // (below), so keeping them string here is what keeps '12.50' from becoming
  // '12.5' -- parsing to a number would compile clean but silently reformat
  // every plan's dollar amounts.
  current: string | null;
  target: string;
  progress: number;
}

/** User's financial data, as generatePlan's callers assemble it — every field is optional. */
interface FinancialData {
  formData?: FormData;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  savings?: number;
  targetSavings?: number;
  goals?: GoalSummary[];
  spendingByCategory?: Record<string, number>;
}

class AIPlanner {
  // Public and writable, not readonly: test/aiUnavailable.test.ts reassigns
  // this directly in beforeEach.
  openai: ChatCompletionsClient | null;

  constructor() {
    this.openai = null;
  }

  /**
   * The OpenAI client, built on first use.
   *
   * It cannot be built in the constructor: this module is exported as an
   * instance, so the constructor runs at require time, and the SDK throws when
   * OPENAI_API_KEY is absent. That turned a missing optional key into a crash
   * before app.ts could even listen — the whole API, not just /ai — and it made
   * the "OpenAI API key not configured" guard in generatePlan unreachable.
   * Building it lazily lets that guard do its job.
   */
  get client(): ChatCompletionsClient {
    if (!this.openai) {
      this.openai = new OpenAI({ apiKey: config.apiKeys.openai });
    }
    return this.openai;
  }

  /**
   * Generate AI financial plan based on user prompt and financial data
   * @param userPrompt - User's financial question or request
   * @param financialData - User's financial data (optional)
   * @param language - Language code (e.g., 'en', 'zh')
   * @returns AI-generated financial plan
   */
  async generatePlan(userPrompt: string, financialData: FinancialData | null = null, language: string = 'en'): Promise<string | null> {
    try {
      if (!config.apiKeys.openai) {
        throw new Error('OpenAI API key not configured');
      }

      // Build context from financial data if provided
      let context = '';
      if (financialData) {
        context = this.buildFinancialContext(financialData);
      }

      let systemPrompt = `
You are a personal finance AI assistant that helps users make smart money decisions. Your tone should be professional but clear, encouraging, and easy to follow.

Your goal is to provide concise, structured, and visually scannable financial plans that fit a web UI. Only include what’s essential.

Respond in the following format:

# 📊 Summary, make this bold and italic
- One-paragraph analysis of the user's situation and goal
- Be specific but avoid fluff

# ✅ Key Recommendations, make this bold and italic
- 3 to 5 concise bullet points
- Each one should start with bolded topic, followed by one actionable sentence

# 📅 Timeline, make this bold and italic
- Bullet points grouped by time (e.g., Month 1-2, Month 3-6, etc.)
- Make the time periods start with "-"
- Only include 3 groups max
- Use short action-oriented phrases

# ⚠️ Risks, make this bold and italic
- 2–3 bullet points about potential risks or obstacles
- each one start with "-"

# 💡 Investment Ideas, make this bold and italic
- 3–4 tailored ETF or stock tickers with 1-sentence explanations
- Only suggest diversified or beginner-safe options unless user is aggressive

Use markdown formatting.
Add 2 blank lines between major sections.
Be brief, helpful, and structured. Avoid paragraphs inside bullet points.
`;
      if (language === 'zh') {
        systemPrompt += '\n\nRespond in Mandarin Chinese.';
      }


      const completion = await this.client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          // The user's actual figures. Kept as a separate turn so userPrompt
          // stays exactly what they typed.
          ...(context ? [{ role: "system", content: context }] : []),
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      // completion.choices[0] is `| undefined` under noUncheckedIndexedAccess,
      // since the client's return type is a plain array with no guaranteed
      // minimum length. OpenAI's chat completions endpoint always returns at
      // least one choice for a request that resolves rather than rejects, so
      // this cast is that assumption made explicit. If it's ever wrong, the
      // cast doesn't change what happens: choices[0] is still undefined at
      // runtime, `.message` still throws a TypeError, and the catch block
      // below still handles it exactly as it did before this file was typed.
      const firstChoice = completion.choices[0] as { message: { content: string | null } };

      return firstChoice.message.content;

    } catch (error) {
      console.error('❌ Error generating AI plan:', error);

      // Duck-typed rather than narrowed to Error/AxiosError: the real failure
      // this exists for is OpenAI's SDK error, but
      // test/aiUnavailable.test.ts throws a plain Error with .status/.code
      // bolted on (Object.assign(new Error(...), { status, code })), which is
      // exactly what this reads and nothing more.
      const err = error as { status?: unknown; code?: unknown; message: string };

      if (err.status === 429 || UNAVAILABLE_CODES.includes(err.code as string)) {
        throw new AiUnavailableError(error);
      }

      // err.message.includes(...) throws here if error has no usable
      // .message — unchanged from the original, which read error.message the
      // same way with no guard.
      if (err.message.includes('API key')) {
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.');
      }

      throw new Error('Failed to generate financial plan. Please try again later.');
    }
  }

  /**
   * Build financial context from user data
   * @param financialData - User's financial information
   * @returns Formatted financial context
   */
  buildFinancialContext(financialData: FinancialData): string {
    let context = 'Based on the user\'s financial profile:\n\n';

    // Add form data if available
    if (financialData.formData) {
      const income = (typeof financialData.formData.currentIncome === 'number' && !isNaN(financialData.formData.currentIncome)) ? financialData.formData.currentIncome : 0;
      const expenses = (typeof financialData.formData.currentExpenses === 'number' && !isNaN(financialData.formData.currentExpenses)) ? financialData.formData.currentExpenses : 0;
      const savings = income - expenses;
      const timeline = financialData.formData.timeline || '';
      const currency = financialData.formData.currency || 'USD';
      context += `**Current Financial Situation:** (amounts in ${currency})\n`;
      context += `• Monthly Income: ${income}\n`;
      context += `• Monthly Expenses: ${expenses}\n`;
      context += `• Monthly Savings: ${savings}\n`;
      context += `• Timeline: ${timeline}\n`;
      if (financialData.formData.additionalContext) {
        context += `• Additional Context: ${financialData.formData.additionalContext}\n`;
      }
      context += '\n';
    }

    // Add historical data if available. Only monthlyIncome gates this block in
    // the original, which assumes the other three arrive alongside it without
    // checking; these casts keep that assumption exactly as it was — a caller
    // that sends monthlyIncome without the rest still throws the same
    // TypeError here that the untyped version did.
    if (financialData.monthlyIncome) {
      context += `**Historical Financial Data:**\n`;
      context += `• Average Monthly Income: $${financialData.monthlyIncome.toFixed(2)}\n`;
      context += `• Average Monthly Expenses: $${(financialData.monthlyExpenses as number).toFixed(2)}\n`;
      context += `• Current Savings: $${(financialData.savings as number).toFixed(2)}\n`;
      context += `• Target Savings: $${(financialData.targetSavings as number).toFixed(2)}\n`;
      context += '\n';
    }

    if (financialData.goals && financialData.goals.length > 0) {
      context += `**Current Financial Goals:**\n`;
      financialData.goals.forEach(goal => {
        context += `• ${goal.name}: $${goal.current} / $${goal.target} (${goal.progress.toFixed(1)}% complete)\n`;
      });
      context += '\n';
    }

    if (financialData.spendingByCategory && Object.keys(financialData.spendingByCategory).length > 0) {
      context += `**Spending by Category (Last 6 Months):**\n`;
      Object.entries(financialData.spendingByCategory).forEach(([category, amount]) => {
        context += `• ${category}: $${amount.toFixed(2)}\n`;
      });
      context += '\n';
    }

    context += 'Please provide personalized advice based on this information, focusing on practical steps and realistic timelines.';

    return context;
  }

  /**
   * Generate budget recommendations
   * @param spendingData - User's spending patterns
   * @returns Budget recommendations
   */
  async generateBudgetRecommendations(spendingData: unknown): Promise<string | null> {
    const prompt = `Based on the following spending patterns, provide specific budget recommendations:

${JSON.stringify(spendingData, null, 2)}

Please provide:
1. Areas where spending can be reduced
2. Recommended budget allocations
3. Specific actionable steps
4. Expected monthly savings`;

    return this.generatePlan(prompt);
  }

  /**
   * Generate investment advice
   * @param investmentProfile - User's investment profile
   * @returns Investment recommendations
   */
  async generateInvestmentAdvice(investmentProfile: unknown): Promise<string | null> {
    const prompt = `Based on the following investment profile, provide personalized investment advice:

${JSON.stringify(investmentProfile, null, 2)}

Please provide:
1. Asset allocation recommendations
2. Risk assessment
3. Investment strategy suggestions
4. Specific investment options to consider`;

    return this.generatePlan(prompt);
  }
}

export = Object.assign(new AIPlanner(), { AiUnavailableError });
