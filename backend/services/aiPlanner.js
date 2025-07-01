const OpenAI = require('openai');

class AIPlanner {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Generate AI financial plan based on user prompt and financial data
   * @param {string} userPrompt - User's financial question or request
   * @param {Object} financialData - User's financial data (optional)
   * @returns {Promise<string>} AI-generated financial plan
   */
  async generatePlan(userPrompt, financialData = null) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      // Build context from financial data if provided
      let context = '';
      if (financialData) {
        context = this.buildFinancialContext(financialData);
      }

      const systemPrompt = `
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
- Only include 3 groups max
- Use short action-oriented phrases

# ⚠️ Risks, make this bold and italic
- 2–3 bullet points about potential risks or obstacles

# 💡 Investment Ideas, make this bold and italic
- 3–4 tailored ETF or stock tickers with 1-sentence explanations
- Only suggest diversified or beginner-safe options unless user is aggressive

Use markdown formatting.
Add 2 blank lines between major sections.
Be brief, helpful, and structured. Avoid paragraphs inside bullet points.
`;


      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      return completion.choices[0].message.content;

    } catch (error) {
      console.error('❌ Error generating AI plan:', error);
      
      if (error.message.includes('API key')) {
        throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.');
      }
      
      throw new Error('Failed to generate financial plan. Please try again later.');
    }
  }

  /**
   * Build financial context from user data
   * @param {Object} financialData - User's financial information
   * @returns {string} Formatted financial context
   */
  buildFinancialContext(financialData) {
    let context = 'Based on the user\'s financial profile:\n\n';
    
    // Add form data if available
    if (financialData.formData) {
      context += `**Current Financial Situation:**\n`;
      context += `• Monthly Income: $${financialData.formData.currentIncome}\n`;
      context += `• Monthly Expenses: $${financialData.formData.currentExpenses}\n`;
      context += `• Monthly Savings: $${financialData.formData.currentIncome - financialData.formData.currentExpenses}\n`;
      context += `• Timeline: ${financialData.formData.timeline}\n`;
      if (financialData.formData.additionalContext) {
        context += `• Additional Context: ${financialData.formData.additionalContext}\n`;
      }
      context += '\n';
    }
    
    // Add historical data if available
    if (financialData.monthlyIncome) {
      context += `**Historical Financial Data:**\n`;
      context += `• Average Monthly Income: $${financialData.monthlyIncome.toFixed(2)}\n`;
      context += `• Average Monthly Expenses: $${financialData.monthlyExpenses.toFixed(2)}\n`;
      context += `• Current Savings: $${financialData.savings.toFixed(2)}\n`;
      context += `• Target Savings: $${financialData.targetSavings.toFixed(2)}\n`;
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
   * @param {Object} spendingData - User's spending patterns
   * @returns {Promise<string>} Budget recommendations
   */
  async generateBudgetRecommendations(spendingData) {
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
   * @param {Object} investmentProfile - User's investment profile
   * @returns {Promise<string>} Investment recommendations
   */
  async generateInvestmentAdvice(investmentProfile) {
    const prompt = `Based on the following investment profile, provide personalized investment advice:

${JSON.stringify(investmentProfile, null, 2)}

Please provide:
1. Asset allocation recommendations
2. Risk assessment
3. Investment strategy suggestions
4. Specific investment options to consider`;

    return this.generatePlan(prompt);
  }

  /**
   * Generate debt payoff strategy
   * @param {Array} debts - User's debt information
   * @returns {Promise<string>} Debt payoff strategy
   */
  async generateDebtPayoffStrategy(debts) {
    const prompt = `Based on the following debt information, provide a debt payoff strategy:

${JSON.stringify(debts, null, 2)}

Please provide:
1. Recommended payoff order (avalanche vs snowball method)
2. Monthly payment recommendations
3. Timeline for debt freedom
4. Strategies to avoid new debt`;

    return this.generatePlan(prompt);
  }
}

module.exports = new AIPlanner(); 