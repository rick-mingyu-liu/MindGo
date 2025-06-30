import { useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, Mail, Lock, User, ArrowLeft } from 'lucide-react'
import { api } from '@/utils/api'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface RegisterForm {
  first_name: string
  last_name: string
  email: string
  password: string
  confirmPassword: string
}

export default function Register() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>()

  const password = watch('password')

  const onSubmit = async (data: RegisterForm) => {
    try {
      setLoading(true)
      
      const { confirmPassword, ...registerData } = data
      const response = await api.post('/auth/register', registerData)
      
      // Store token and user data
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      
      toast.success('Registration successful! Welcome to MindGo.')
      router.push('/')
      
    } catch (error) {
      console.error('Registration error:', error)
      // Error handling is done in api interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>Register - MindGo</title>
        <meta name="description" content="Create your MindGo account" />
      </Head>

      <div className="min-h-screen bg-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 aurora-particles">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="text-center">
            <div className="mx-auto mb-4 flex justify-center">
              <Image
                src="/Finora.png"
                alt="MindGo Logo"
                width={120}
                height={120}
                className="h-16 w-auto aurora-glow"
                priority
              />
            </div>
            <h1 className="text-3xl font-bold text-green-700 aurora-text">MindGo</h1>
            <p className="mt-2 text-sm text-gray-600">
              Create your account
            </p>
          </div>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <Card className="shadow-xl bg-white border border-gray-200">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl text-center text-green-700">Create account</CardTitle>
              <CardDescription className="text-center">
                Enter your information to create your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="first_name"
                        placeholder="First name"
                        className="pl-10 bg-gray-50 border-gray-300 text-gray-900"
                        {...register('first_name', {
                          required: 'First name is required',
                          minLength: {
                            value: 2,
                            message: 'First name must be at least 2 characters',
                          },
                        })}
                      />
                    </div>
                    {errors.first_name && (
                      <p className="text-sm text-destructive">{errors.first_name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="last_name"
                        placeholder="Last name"
                        className="pl-10 bg-gray-50 border-gray-300 text-gray-900"
                        {...register('last_name', {
                          required: 'Last name is required',
                          minLength: {
                            value: 2,
                            message: 'Last name must be at least 2 characters',
                          },
                        })}
                      />
                    </div>
                    {errors.last_name && (
                      <p className="text-sm text-destructive">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      className="pl-10 bg-gray-50 border-gray-300 text-gray-900"
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address',
                        },
                      })}
                    />
                  </div>
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Create a password"
                      className="pl-10 pr-10 bg-gray-50 border-gray-300 text-gray-900"
                      {...register('password', {
                        required: 'Password is required',
                        minLength: {
                          value: 6,
                          message: 'Password must be at least 6 characters',
                        },
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
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm your password"
                      className="pl-10 pr-10 bg-gray-50 border-gray-300 text-gray-900"
                      {...register('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: (value) =>
                          value === password || 'Passwords do not match',
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={loading}>
                  {loading ? 'Creating account...' : 'Create account'}
                </Button>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-yellow-400" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-yellow-700">
                      Already have an account?
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-4 border-yellow-400 text-yellow-700"
                  onClick={() => router.push('/login')}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Sign in to existing account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
} 