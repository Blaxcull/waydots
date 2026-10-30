import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { AuthRedirect } from '@/components/AuthRedirect'

function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return <img src="/applogo.png" alt="Waydots" className={className} />;
}

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else if (data.user) {
      const today = new Date()
      navigate(`/day/${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`)
    }

    setLoading(false)
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-6 bg-background overflow-hidden font-sf-pro">
      {/* Background Elements */}
      <div 
        className="absolute inset-0 -z-10 w-full h-full opacity-50"
        style={{ background: "var(--gradient-hero)" }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ duration: 1.5 }}
        aria-hidden
        className="absolute -left-20 top-0 h-[500px] w-[500px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, var(--brand-warm) 0%, transparent 70%)" }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.2 }}
        transition={{ duration: 1.5, delay: 0.2 }}
        aria-hidden
        className="absolute -right-20 bottom-0 h-[400px] w-[400px] rounded-full blur-[100px]"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
        className="absolute top-8 left-8 z-10"
      >
        <Link 
          to="/" 
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to home
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[400px]"
      >
        <div className="flex flex-col items-center mb-6">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mb-4 p-2.5 rounded-2xl bg-card border border-border/50 shadow-soft"
          >
            <Logo className="h-9 w-9" />
          </motion.div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        </div>

        <Card className="border-border/50 bg-card/70 backdrop-blur-xl shadow-soft rounded-[2rem] overflow-hidden">
          <CardHeader className="pt-6 px-8 pb-4">
            <CardTitle className="text-xl">Login</CardTitle>
          </CardHeader>
          <CardContent className="pb-8 px-8">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  className="h-11 rounded-xl bg-background/50 border-border/50 focus:ring-accent/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <Label htmlFor="password" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Password
                  </Label>
                  <Link to="/reset-password" className="text-[10px] font-medium text-muted-foreground hover:text-foreground">
                    Forgot?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="h-11 rounded-xl bg-background/50 border-border/50 focus:ring-accent/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <motion.p 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="text-xs text-destructive font-medium bg-destructive/10 p-2.5 rounded-lg"
                >
                  {error}
                </motion.p>
              )}
              <Button 
                type="submit" 
                size="lg" 
                className="w-full rounded-full font-bold shadow-soft transition-all active:scale-[0.98] mt-2" 
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Logging in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Login <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </form>
            
            <div className="relative mt-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-transparent px-2 text-muted-foreground font-bold tracking-widest">
                  Or
                </span>
              </div>
            </div>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-foreground font-bold hover:underline underline-offset-4">
                Sign up
              </Link>
            </p>
          </CardContent>
        </Card>
        
        <p className="mt-6 text-center text-[10px] text-muted-foreground/60 px-4">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </motion.div>
    </div>
  )
}

export function Login() {
  return (
    <AuthRedirect>
      <LoginContent />
    </AuthRedirect>
  )
}
