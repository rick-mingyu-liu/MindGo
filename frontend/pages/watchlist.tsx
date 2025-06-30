import React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { ArrowLeft } from 'lucide-react'
import { StockWatchlist } from '@/components/StockWatchlist'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'

export default function WatchlistPage() {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>Stock Watchlist - Finora</title>
        <meta name="description" content="Track your favorite stocks and get detailed financial information" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 relative overflow-hidden">
        {/* Aurora Background Effects */}
        <div className="aurora-bg"></div>
        <div className="aurora-particles"></div>
        
        <div className="relative z-10">
          {/* Header */}
          <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => router.back()}
                      className="mr-2"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push('/')}
                      size="sm"
                    >
                      Dashboard
                    </Button>
                  </div>
                  <div className="aurora-logo">
                    <img 
                      src="/Finora.png" 
                      alt="Finora" 
                      className="h-8 w-auto"
                    />
                  </div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-primary via-purple-500 to-cyan-500 bg-clip-text text-transparent">
                    Enhanced Stock Watchlist
                  </h1>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">
            <div className="max-w-7xl mx-auto">
              {/* Breadcrumb Navigation */}
              <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                <button 
                  onClick={() => router.push('/')}
                  className="hover:text-foreground transition-colors"
                >
                  Dashboard
                </button>
                <span>/</span>
                <button 
                  onClick={() => router.push('/investments')}
                  className="hover:text-foreground transition-colors"
                >
                  Investments
                </button>
                <span>/</span>
                <span className="text-foreground">Enhanced Watchlist</span>
              </div>

              <div className="mb-8">
                <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  Your Stock Portfolio
                </h2>
                <p className="text-muted-foreground text-lg">
                  Monitor your favorite stocks, track performance, and access detailed financial information
                </p>
              </div>

              <StockWatchlist />
            </div>
          </main>
        </div>
      </div>

      <style jsx>{`
        .aurora-bg::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.3) 0%, transparent 50%);
          animation: aurora-float 20s ease-in-out infinite;
          pointer-events: none;
          z-index: 0;
        }

        .aurora-particles::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image: 
            radial-gradient(2px 2px at 20px 30px, rgba(255, 255, 255, 0.1), transparent),
            radial-gradient(2px 2px at 40px 70px, rgba(255, 255, 255, 0.1), transparent),
            radial-gradient(1px 1px at 90px 40px, rgba(255, 255, 255, 0.1), transparent),
            radial-gradient(1px 1px at 130px 80px, rgba(255, 255, 255, 0.1), transparent),
            radial-gradient(2px 2px at 160px 30px, rgba(255, 255, 255, 0.1), transparent);
          background-repeat: repeat;
          background-size: 200px 100px;
          animation: aurora-sparkle 15s linear infinite;
          pointer-events: none;
          z-index: 0;
        }

        @keyframes aurora-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-20px) rotate(1deg); }
          66% { transform: translateY(10px) rotate(-1deg); }
        }

        @keyframes aurora-sparkle {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-100px); }
        }

        .aurora-logo {
          position: relative;
        }

        .aurora-logo::after {
          content: '';
          position: absolute;
          top: -2px;
          left: -2px;
          right: -2px;
          bottom: -2px;
          background: linear-gradient(45deg, #3b82f6, #8b5cf6, #06b6d4, #3b82f6);
          border-radius: 8px;
          z-index: -1;
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .aurora-logo:hover::after {
          opacity: 1;
        }
      `}</style>
    </>
  )
} 