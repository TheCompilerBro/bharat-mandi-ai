import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  id: string
  name: string
  email: string
  preferredLanguage: string
  location: {
    state: string
    district: string
    market: string
  }
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session on app load
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken')
        if (token) {
          // For demo mode, just check if token exists
          // In production, this would validate with the backend
          const mockUser = {
            id: 'demo-user-1',
            name: 'Demo Vendor',
            email: 'demo@example.com',
            preferredLanguage: 'en',
            location: {
              state: 'Maharashtra',
              district: 'Pune',
              market: 'Pune Mandi'
            }
          }
          setUser(mockUser)
        }
      } catch (error) {
        console.error('Auth check failed:', error)
        localStorage.removeItem('accessToken')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      console.log('AuthContext: Attempting login with path /api/v1/auth/login');
      
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      console.log('AuthContext: Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log('AuthContext: Error response:', errorData);
        
        // Handle specific error cases
        if (errorData.code === 'RATE_LIMIT_EXCEEDED') {
          throw new Error('Too many login attempts. Please try again later.');
        } else if (errorData.code === 'INVALID_CREDENTIALS') {
          throw new Error('Invalid email or password');
        } else {
          throw new Error(errorData.error || 'Login failed');
        }
      }

      const result = await response.json()
      console.log('AuthContext: Login result:', result);
      
      if (result.message === 'Login successful') {
        // Store the access token
        localStorage.setItem('accessToken', result.tokens.accessToken)
        localStorage.setItem('refreshToken', result.tokens.refreshToken)
        
        // Transform vendor data to user format
        const user = {
          id: result.vendor.id,
          name: result.vendor.name,
          email: result.vendor.email,
          preferredLanguage: result.vendor.preferredLanguage,
          location: result.vendor.location
        }
        
        setUser(user)
      } else {
        throw new Error(result.error || 'Login failed')
      }
    } catch (error) {
      console.error('AuthContext: Login error:', error)
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    loading,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}