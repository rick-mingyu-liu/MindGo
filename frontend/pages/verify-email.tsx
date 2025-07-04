import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { CheckCircle, XCircle, Mail, ArrowRight } from 'lucide-react'
import { api } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTheme } from '@/contexts/ThemeContext'

export default function VerifyEmail() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const { token } = router.query
    
    if (token && typeof token === 'string') {
      verifyEmail(token)
    }
  }, [router.query])

  const verifyEmail = async (token: string) => {
    try {
      const response = await api.get(`/auth/verify-email/${token}`)
      setVerificationStatus('success')
      setMessage(response.data.message)
      setUserEmail(response.data.user.email)
      toast.success('Email verified successfully!')
    } catch (error: any) {
      setVerificationStatus('error')
      setMessage(error.response?.data?.error || 'Verification failed')
      toast.error('Email verification failed')
    }
  }

  const getStatusIcon = () => {
    switch (verificationStatus) {
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />
      case 'error':
        return <XCircle className="h-16 w-16 text-red-500" />
      default:
        return <Mail className="h-16 w-16 text-blue-500 animate-pulse" />
    }
  }

  const getStatusTitle = () => {
    switch (verificationStatus) {
      case 'success':
        return 'Email Verified Successfully!'
      case 'error':
        return 'Verification Failed'
      default:
        return 'Verifying Your Email...'
    }
  }

  const getStatusDescription = () => {
    switch (verificationStatus) {
      case 'success':
        return 'Your email has been verified. You can now log in to your MindGo account.'
      case 'error':
        return message || 'There was an error verifying your email address.'
      default:
        return 'Please wait while we verify your email address...'
    }
  }

  return (
    <>
      <Head>
        <title>Verify Email - MindGo</title>
        <meta name="description" content="Verify your MindGo account email" />
      </Head>

      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 aurora-particles">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <Image
                src={resolvedTheme === 'dark' ? "/MindGo_dark.png" : "/MindGo.png"}
                alt="MindGo Logo"
                width={160}
                height={160}
                className="h-24 w-auto aurora-glow"
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-green-700 dark:text-green-400 aurora-text">MindGo</h1>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <Card className="shadow-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                {getStatusIcon()}
              </div>
              <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                {getStatusTitle()}
              </CardTitle>
              <CardDescription className="text-center">
                {getStatusDescription()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {verificationStatus === 'success' && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm text-green-800 dark:text-green-200">
                      <strong>Email:</strong> {userEmail}
                    </p>
                  </div>
                  <Button 
                    onClick={() => router.push('/login')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    Continue to Login
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}

              {verificationStatus === 'error' && (
                <div className="space-y-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200">
                      {message}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Button 
                      onClick={() => router.push('/login')}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      Go to Login
                    </Button>
                    <Button 
                      onClick={() => router.push('/register')}
                      variant="outline"
                      className="w-full border-yellow-400 dark:border-yellow-500 text-yellow-700 dark:text-yellow-300"
                    >
                      Register New Account
                    </Button>
                  </div>
                </div>
              )}

              {verificationStatus === 'loading' && (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
} 