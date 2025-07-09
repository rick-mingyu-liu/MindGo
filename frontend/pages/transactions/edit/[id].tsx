import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { ArrowLeft, Save, Trash2 } from 'lucide-react'
import { api } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Swal from 'sweetalert2'

interface Transaction {
  id: number
  description: string
  amount: number
  type: 'income' | 'expense'
  category: string
  date: string
  currency: string // Add currency field
}

const CATEGORIES = [
  'Salary',
  'Freelance',
  'Investment',
  'Food & Dining',
  'Transportation',
  'Housing',
  'Utilities',
  'Entertainment',
  'Healthcare',
  'Shopping',
  'Education',
  'Other'
]

export default function EditTransaction() {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '',
    date: '',
    currency: 'CAD', // Default currency
  })

  useEffect(() => {
    if (id) {
      fetchTransaction()
    }
  }, [id])

  const fetchTransaction = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/transactions`)
      const transactions = response.data.transactions
      const targetTransaction = transactions.find((t: Transaction) => t.id === parseInt(id as string))
      
      if (!targetTransaction) {
        Swal.fire({
          icon: 'error',
          title: 'Transaction not found',
          text: 'The transaction you are trying to edit does not exist.'
        })
        router.push('/transactions')
        return
      }

      setTransaction(targetTransaction)
      setFormData({
        description: targetTransaction.description,
        amount: targetTransaction.amount.toString(),
        type: targetTransaction.type,
        category: targetTransaction.category,
        date: targetTransaction.date.split('T')[0],
        currency: targetTransaction.currency || 'CAD',
      })
    } catch (error) {
      console.error('Error fetching transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to load transaction',
        text: 'There was an error loading the transaction. Please try again later.'
      })
      router.push('/transactions')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.description || !formData.amount || !formData.category || !formData.date) {
      Swal.fire({
        icon: 'error',
        title: 'Please fill in all required fields',
        text: 'You must provide a description, amount, category, and date for the transaction.'
      })
      return
    }

    try {
      setSaving(true)
      await api.put(`/transactions/${id}`, {
        description: formData.description,
        amount: parseFloat(formData.amount),
        type: formData.type,
        category: formData.category,
        date: formData.date,
        currency: formData.currency,
      })

      Swal.fire({
        icon: 'success',
        title: 'Transaction updated successfully',
        text: 'The transaction has been updated successfully.'
      })
      router.push('/transactions')
    } catch (error) {
      console.error('Error updating transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to update transaction',
        text: 'There was an error updating the transaction. Please try again later.'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(true)
      await api.delete(`/transactions/${id}`)
      Swal.fire({
        icon: 'success',
        title: 'Transaction deleted successfully',
        text: 'The transaction has been deleted successfully.'
      })
      router.push('/transactions')
    } catch (error) {
      console.error('Error deleting transaction:', error)
      Swal.fire({
        icon: 'error',
        title: 'Failed to delete transaction',
        text: 'There was an error deleting the transaction. Please try again later.'
      })
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Edit Transaction - Personal Finance App</title>
        <meta name="description" content="Edit your transaction" />
      </Head>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b bg-card">
          <div className="container mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/transactions')}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Transactions
                </Button>
                <div>
                  <h1 className="text-3xl font-bold">Edit Transaction</h1>
                  <p className="text-muted-foreground">
                    Update your transaction details
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Edit Transaction</CardTitle>
                <CardDescription>
                  Update the details of your transaction
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Enter transaction description"
                      required
                    />
                  </div>

                  {/* Amount */}
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </div>
                  {/* Currency */}
                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency *</Label>
                    <Select
                      value={formData.currency}
                      onValueChange={(value) => setFormData({ ...formData, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CAD">CAD ($)</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="CNY">CNY (¥)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="AUD">AUD (A$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Type */}
                  <div className="space-y-2">
                    <Label htmlFor="type">Type *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value: 'income' | 'expense') => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date */}
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-6">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deleting ? 'Deleting...' : 'Delete Transaction'}
                    </Button>
                    
                    <div className="flex space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push('/transactions')}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={saving}
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
} 