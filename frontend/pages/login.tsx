import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Mail, Lock, ArrowRight, X, TrendingUp, Shield, Target, BarChart3, Users, Zap, Volume2, Users2, AlertCircle, AlertTriangle } from 'lucide-react'
import { api } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/contexts/ThemeContext'
import Swal from 'sweetalert2'

interface LoginForm {
  email: string
  password: string
}

export default function Login() {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [verificationError, setVerificationError] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<LoginForm>()

  const email = watch('email')

  const onSubmit = async (data: LoginForm) => {
    try {
      setLoading(true)
      setVerificationError('')
      setLoginError('')
      
      const response = await api.post('/auth/login', data)
      
      // Store token and user data
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      
      Swal.fire({
        icon: 'success',
        title: 'Login successful!',
        text: 'Welcome back!',
        confirmButtonColor: '#facc15',
      })
      router.push('/')
      
    } catch (error: any) {
      console.error('Login error:', error)
      
      if (error.response?.data?.requiresVerification) {
        setVerificationError(error.response.data.error)
      } else if (error.response?.data?.error) {
        setLoginError(error.response.data.error)
      } else {
        setLoginError('An unexpected error occurred. Please try again.')
      }
      // Other error handling is done in api interceptor
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    if (!email) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Please enter your email address first',
      })
      return
    }

    try {
      setResendLoading(true)
      await api.post('/auth/resend-verification', { email })
      Swal.fire({
        icon: 'success',
        title: 'Verification email sent successfully!',
      })
      setVerificationError('')
    } catch (error: any) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.response?.data?.error || 'Failed to send verification email',
      })
    } finally {
      setResendLoading(false)
    }
  }

  // Prevent blank spaces in input fields
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    if (value.includes(' ')) {
      e.target.value = value.replace(/\s/g, '')
    }
  }

  return (
    <>
      <Head>
        <title>Login - MindGo</title>
        <meta name="description" content="Sign in to your MindGo account" />
      </Head>

      <div className="min-h-screen relative flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-white dark:bg-gray-950 aurora-particles">
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
            <button
              onClick={() => setShowIntro(true)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline cursor-pointer transition-colors"
            >
              Who are we?
            </button>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <Card className="shadow-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center text-green-700 dark:text-green-400">Welcome back</CardTitle>
              <CardDescription className="text-center">
                Enter your credentials to access your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginError && (
                <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">
                        {loginError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {verificationError && (
                <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                        {verificationError}
                      </p>
                      <Button
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        size="sm"
                        className="bg-yellow-600 hover:bg-yellow-700 text-white"
                      >
                        {resendLoading ? 'Sending...' : 'Resend Verification Email'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10 bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                      onInput={handleInputChange}
                      onKeyDown={(e) => { if (e.key === ' ') e.preventDefault(); }}
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                        validate: (value) => !/\s/.test(value) || 'Email cannot contain spaces',
                      })}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      className="pl-10 pr-10 bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                      onInput={handleInputChange}
                      onKeyDown={(e) => { if (e.key === ' ') e.preventDefault(); }}
                      {...register('password', {
                        required: 'Password is required',
                        minLength: {
                          value: 6,
                          message: 'Password must be at least 6 characters',
                        },
                        validate: (value) => !/\s/.test(value) || 'Password cannot contain spaces',
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">{errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-yellow-400" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Don't have an account?
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-4 border-yellow-400 dark:border-yellow-500 text-yellow-700 dark:text-yellow-300"
                  onClick={() => router.push('/register')}
                >
                  Create new account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>

              {/* Demo credentials */}
              <div className="mt-6 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary" className="bg-yellow-400 dark:bg-yellow-500 text-yellow-900 dark:text-yellow-950">Demo Account</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    <span className="font-medium">Email:</span> john.doe@example.com
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium">Password:</span> password123
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Who are we Modal */}
      <Dialog open={showIntro} onOpenChange={setShowIntro}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-yellow-400 dark:border-yellow-500 shadow-2xl text-gray-900 dark:text-gray-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Image
                src={resolvedTheme === 'dark' ? "/MindGo_dark.png" : "/MindGo.png"}
                alt="MindGo Logo"
                width={60}
                height={60}
                className="h-15 w-auto"
              />
              <div>
                <h2 className="text-2xl font-bold text-green-700 dark:text-green-400">Welcome to MindGo</h2>
                <p className="text-sm text-muted-foreground">Your AI-Powered Personal Finance Companion</p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Mission Statement */}
            <div className="text-center py-4">
              <h3 className="text-xl font-semibold mb-2 text-green-700 dark:text-green-400">Our Mission</h3>
              <p className="text-muted-foreground">
                To democratize financial intelligence by providing everyone with AI-powered tools 
                to make smarter financial decisions, track their progress, and achieve their goals.
              </p>
            </div>

            {/* Key Features */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Smart Investment Tracking</h4>
                    <p className="text-sm text-muted-foreground">
                      Real-time stock analysis, K-charts, and AI-powered investment insights to help you make informed decisions.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Goal Setting & Tracking</h4>
                    <p className="text-sm text-muted-foreground">
                      Set financial goals, track your progress, and get personalized recommendations to stay on target.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                    <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Expense Analytics</h4>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive spending analysis with AI-powered insights to identify saving opportunities.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                    <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">AI Financial Planning</h4>
                    <p className="text-sm text-muted-foreground">
                      Get personalized financial plans, budget recommendations, and investment advice powered by AI.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                    <Shield className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Secure & Private</h4>
                    <p className="text-sm text-muted-foreground">
                      Bank-level security with end-to-end encryption to keep your financial data safe and private.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                    <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-green-700 dark:text-green-400">Community Driven</h4>
                    <p className="text-sm text-muted-foreground">
                      Join a community of financially conscious individuals sharing insights and strategies.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Ready to take control of your financial future? Start your journey with MindGo today.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => router.push('/register')}>
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => setShowIntro(false)}>
                  Continue to Login
                </Button>
              </div>
            </div>

            {/* Ads and Collaboration Opportunities */}
            <div className="border-t border-border pt-6">
              <h3 className="text-xl font-semibold mb-4 text-green-700 dark:text-green-400">Partnership & Collaboration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                      <Volume2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-green-700 dark:text-green-400">Advertising Opportunities</h4>
                      <p className="text-sm text-muted-foreground">
                        Reach our engaged community of financially conscious users. We offer targeted advertising solutions 
                        for financial services, investment products, and educational content.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-teal-100 dark:bg-teal-900 rounded-lg">
                      <Users2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-green-700 dark:text-green-400">Collaboration Opportunities</h4>
                      <p className="text-sm text-muted-foreground">
                        Partner with us to create innovative financial solutions. We're open to strategic partnerships, 
                        API integrations, and joint ventures that benefit our users.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground mb-3">
                  Interested in advertising or collaboration? Get in touch with us.
                </p>
                <a 
                  href="mailto:mindgofinance@gmail.com" 
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-green-600 dark:border-green-500 text-green-700 dark:text-green-300 bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                >
                  Contact Us
                  <Mail className="ml-2 h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* Add this to your global CSS (e.g., globals.css or in a <style jsx global>)
.floating-tech-icons {
  animation: marquee 18s linear infinite;
}
@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
*/ 