import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useForm } from 'react-hook-form'
import { ArrowLeft, Save, Calendar, DollarSign, Tag } from 'lucide-react'
import { api } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TransactionForm {
  description: string
  amount: string
  type: 'income' | 'expense'
  category: string
  date: string
  notes: string
}

const categories = {
  income: [
    'Salary',
    'Freelance',
    'Investment Returns',
    'Business',
    'Other Income'
  ],
  expense: [
    'Food & Dining',
    'Transportation',
    'Housing',
    'Utilities',
    'Entertainment',
    'Shopping',
    'Healthcare',
    'Education',
    'Travel',
    'Other Expenses'
  ]
}

export default function NewTransaction() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense')
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionForm>({
    defaultValues: {
      type: 'expense',
      date: new Date().toISOString().split('T')[0],
    }
  })

  const onSubmit = async (data: TransactionForm) => {
    try {
      setLoading(true)
      
      const response = await api.post('/transactions', {
        ...data,
        amount: parseFloat(data.amount),
      })
      
      toast.success('Transaction added successfully!')
      router.push('/')
      
    } catch (error) {
      console.error('Transaction error:', error)
      // Error handling is done in api interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleTypeChange = (type: 'income' | 'expense') => {
    setTransactionType(type)
    setValue('type', type)
    setValue('category', '')
  }

  return (
    <>
      <Head>
        <title>Add Transaction - Personal Finance App</title>
        <meta name="description" content="Add a new transaction" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center py-6">
              <Button
                variant="ghost"
                onClick={() => router.push('/')}
                className="mr-4"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Add Transaction</h1>
                <p className="text-muted-foreground">Record a new income or expense</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
              <CardDescription>
                Fill in the details of your transaction
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
                {/* Transaction Type */}
                <div className="space-y-2">
                  <Label>Transaction Type</Label>
                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant={transactionType === 'expense' ? 'default' : 'outline'}
                      onClick={() => handleTypeChange('expense')}
                      className="flex-1"
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Expense
                    </Button>
                    <Button
                      type="button"
                      variant={transactionType === 'income' ? 'default' : 'outline'}
                      onClick={() => handleTypeChange('income')}
                      className="flex-1"
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Income
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="e.g., Grocery shopping, Salary payment"
                    {...register('description', {
                      required: 'Description is required',
                      minLength: {
                        value: 3,
                        message: 'Description must be at least 3 characters',
                      },
                    })}
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount ($)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...register('amount', {
                      required: 'Amount is required',
                      min: {
                        value: 0.01,
                        message: 'Amount must be greater than 0',
                      },
                    })}
                  />
                  {errors.amount && (
                    <p className="text-sm text-destructive">{errors.amount.message}</p>
                  )}
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select onValueChange={(value) => setValue('category', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories[transactionType].map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.category && (
                    <p className="text-sm text-destructive">{errors.category.message}</p>
                  )}
                </div>

                {/* Date */}
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="date"
                      type="date"
                      className="pl-10"
                      {...register('date', {
                        required: 'Date is required',
                      })}
                    />
                  </div>
                  {errors.date && (
                    <p className="text-sm text-destructive">{errors.date.message}</p>
                  )}
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional notes about this transaction..."
                    className="min-h-[100px]"
                    {...register('notes')}
                  />
                </div>

                {/* Hidden type field */}
                <input type="hidden" {...register('type')} />

                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push('/')}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Transaction
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </>
  )
} 