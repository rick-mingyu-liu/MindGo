-- Seed data for Personal Finance App

-- Insert sample user (password: password123)
INSERT INTO users (email, password_hash, first_name, last_name) VALUES
('john.doe@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'John', 'Doe')
ON CONFLICT (email) DO NOTHING;

-- Get user ID for foreign key references
DO $$
DECLARE
    user_id INTEGER;
BEGIN
    SELECT id INTO user_id FROM users WHERE email = 'john.doe@example.com';
    
    -- Insert sample transactions for the last 4 months (2025)
    INSERT INTO transactions (user_id, amount, description, category, type, date, currency) VALUES
    -- Income transactions (2025)
    (user_id, 5000.00, 'Salary - March 2025', 'Salary', 'income', '2025-03-15', 'CAD'),
    (user_id, 5000.00, 'Salary - April 2025', 'Salary', 'income', '2025-04-15', 'CAD'),
    (user_id, 5000.00, 'Salary - May 2025', 'Salary', 'income', '2025-05-15', 'CAD'),
    (user_id, 5000.00, 'Salary - June 2025', 'Salary', 'income', '2025-06-15', 'CAD'),
    (user_id, 500.00, 'Freelance Project', 'Freelance', 'income', '2025-04-20', 'CAD'),
    (user_id, 300.00, 'Dividend Payment', 'Investment Returns', 'income', '2025-05-10', 'CAD'),
    (user_id, 800.00, 'Side Business Income', 'Business', 'income', '2025-06-05', 'CAD'),
    
    -- Expense transactions (2025)
    (user_id, 1200.00, 'Rent Payment', 'Housing', 'expense', '2025-03-01', 'CAD'),
    (user_id, 1200.00, 'Rent Payment', 'Housing', 'expense', '2025-04-01', 'CAD'),
    (user_id, 1200.00, 'Rent Payment', 'Housing', 'expense', '2025-05-01', 'CAD'),
    (user_id, 1200.00, 'Rent Payment', 'Housing', 'expense', '2025-06-01', 'CAD'),
    (user_id, 400.00, 'Grocery Shopping', 'Groceries', 'expense', '2025-03-05', 'CAD'),
    (user_id, 350.00, 'Grocery Shopping', 'Groceries', 'expense', '2025-04-05', 'CAD'),
    (user_id, 420.00, 'Grocery Shopping', 'Groceries', 'expense', '2025-05-05', 'CAD'),
    (user_id, 380.00, 'Grocery Shopping', 'Groceries', 'expense', '2025-06-05', 'CAD'),
    (user_id, 150.00, 'Electric Bill', 'Utilities', 'expense', '2025-03-10', 'CAD'),
    (user_id, 140.00, 'Electric Bill', 'Utilities', 'expense', '2025-04-10', 'CAD'),
    (user_id, 160.00, 'Electric Bill', 'Utilities', 'expense', '2025-05-10', 'CAD'),
    (user_id, 145.00, 'Electric Bill', 'Utilities', 'expense', '2025-06-10', 'CAD'),
    (user_id, 80.00, 'Internet Bill', 'Utilities', 'expense', '2025-03-10', 'CAD'),
    (user_id, 80.00, 'Internet Bill', 'Utilities', 'expense', '2025-04-10', 'CAD'),
    (user_id, 80.00, 'Internet Bill', 'Utilities', 'expense', '2025-05-10', 'CAD'),
    (user_id, 80.00, 'Internet Bill', 'Utilities', 'expense', '2025-06-10', 'CAD'),
    (user_id, 200.00, 'Gas and Transportation', 'Transportation', 'expense', '2025-03-15', 'CAD'),
    (user_id, 180.00, 'Gas and Transportation', 'Transportation', 'expense', '2025-04-15', 'CAD'),
    (user_id, 220.00, 'Gas and Transportation', 'Transportation', 'expense', '2025-05-15', 'CAD'),
    (user_id, 190.00, 'Gas and Transportation', 'Transportation', 'expense', '2025-06-15', 'CAD'),
    (user_id, 100.00, 'Movie Night', 'Entertainment', 'expense', '2025-03-20', 'CAD'),
    (user_id, 120.00, 'Restaurant Dinner', 'Entertainment', 'expense', '2025-04-20', 'CAD'),
    (user_id, 90.00, 'Streaming Services', 'Entertainment', 'expense', '2025-05-20', 'CAD'),
    (user_id, 110.00, 'Weekend Trip', 'Entertainment', 'expense', '2025-06-20', 'CAD'),
    (user_id, 500.00, 'Emergency Fund Contribution', 'Savings', 'expense', '2025-03-25', 'CAD'),
    (user_id, 500.00, 'Emergency Fund Contribution', 'Savings', 'expense', '2025-04-25', 'CAD'),
    (user_id, 500.00, 'Emergency Fund Contribution', 'Savings', 'expense', '2025-05-25', 'CAD'),
    (user_id, 500.00, 'Emergency Fund Contribution', 'Savings', 'expense', '2025-06-25', 'CAD'),
    (user_id, 250.00, 'Shopping - Clothes', 'Shopping', 'expense', '2025-03-12', 'CAD'),
    (user_id, 180.00, 'Shopping - Electronics', 'Shopping', 'expense', '2025-04-18', 'CAD'),
    (user_id, 320.00, 'Shopping - Home Goods', 'Shopping', 'expense', '2025-05-22', 'CAD'),
    (user_id, 150.00, 'Shopping - Books', 'Shopping', 'expense', '2025-06-08', 'CAD'),
    (user_id, 120.00, 'Doctor Visit', 'Healthcare', 'expense', '2025-03-28', 'CAD'),
    (user_id, 85.00, 'Pharmacy', 'Healthcare', 'expense', '2025-04-14', 'CAD'),
    (user_id, 200.00, 'Dental Checkup', 'Healthcare', 'expense', '2025-05-30', 'CAD'),
    (user_id, 95.00, 'Vitamins', 'Healthcare', 'expense', '2025-06-12', 'CAD')
    ON CONFLICT DO NOTHING;
    
    -- Insert sample savings goal
    INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, description) VALUES
    (user_id, 'Emergency Fund', 10000.00, 2000.00, '2024-12-31', 'Build emergency fund to cover 6 months of expenses'),
    (user_id, 'House Down Payment', 50000.00, 15000.00, '2025-06-30', 'Save for 20% down payment on a $250,000 house'),
    (user_id, 'Vacation Fund', 5000.00, 1200.00, '2024-08-15', 'Save for summer vacation to Europe')
    ON CONFLICT DO NOTHING;
    
    -- Insert sample watchlist items
    INSERT INTO watchlist (user_id, symbol, company_name) VALUES
    (user_id, 'AAPL', 'Apple Inc.'),
    (user_id, 'GOOGL', 'Alphabet Inc.'),
    (user_id, 'MSFT', 'Microsoft Corporation'),
    (user_id, 'TSLA', 'Tesla Inc.'),
    (user_id, 'AMZN', 'Amazon.com Inc.'),
    (user_id, 'NVDA', 'NVIDIA Corporation')
    ON CONFLICT DO NOTHING;
    
    -- Insert sample AI plan
    INSERT INTO ai_plans (user_id, prompt, response) VALUES
    (user_id, 'How can I save more money each month?', 'Based on your current spending patterns, here are some recommendations to increase your monthly savings:

1. **Review Entertainment Expenses**: You''re spending $100-120/month on entertainment. Consider reducing this by 20-30% to save $20-36/month.

2. **Optimize Transportation**: Your gas expenses vary significantly ($180-220/month). Consider carpooling or using public transportation to reduce costs.

3. **Utility Optimization**: Your electric bill fluctuates ($140-160/month). Implement energy-saving measures like LED bulbs and smart thermostats.

4. **Emergency Fund Priority**: You''re consistently contributing $500/month to your emergency fund, which is excellent. Consider increasing this to $600-700/month to reach your $10,000 goal faster.

5. **Additional Income**: You have some freelance income ($500 in February). Consider expanding this to generate an additional $200-300/month consistently.

Total potential monthly savings: $100-200/month')
    ON CONFLICT DO NOTHING;

END $$; 