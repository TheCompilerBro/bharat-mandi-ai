import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './Profile.css'

interface ProfileData {
  name: string
  email: string
  phone: string
  location: {
    state: string
    district: string
    market: string
  }
  preferredLanguage: string
  secondaryLanguages: string[]
  businessType: 'farmer' | 'trader' | 'wholesaler' | 'retailer'
  trustScore: number
  verificationStatus: 'pending' | 'verified' | 'rejected'
}

const Profile: React.FC = () => {
  const { user, logout } = useAuth()
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'te', name: 'Telugu' },
    { code: 'bn', name: 'Bengali' },
    { code: 'mr', name: 'Marathi' },
    { code: 'gu', name: 'Gujarati' },
    { code: 'kn', name: 'Kannada' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'pa', name: 'Punjabi' }
  ]

  const businessTypes = [
    { value: 'farmer', label: 'Farmer' },
    { value: 'trader', label: 'Trader' },
    { value: 'wholesaler', label: 'Wholesaler' },
    { value: 'retailer', label: 'Retailer' }
  ]

  useEffect(() => {
    // Use user data from AuthContext instead of making API call
    if (user) {
      const profileData: ProfileData = {
        name: user.name,
        email: user.email,
        phone: '+919876543210', // Mock phone number
        location: user.location,
        preferredLanguage: user.preferredLanguage,
        secondaryLanguages: [], // Mock empty secondary languages
        businessType: 'trader', // Mock business type
        trustScore: 4.2, // Mock trust score
        verificationStatus: 'verified' // Mock verification status
      }
      setProfileData(profileData)
    }
    setLoading(false)
  }, [user])

  const saveProfile = async () => {
    if (!profileData) return

    setSaving(true)
    try {
      // Mock save - in real implementation would call API
      console.log('Saving profile:', profileData)
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to save profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    if (!profileData) return

    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setProfileData({
        ...profileData,
        [parent]: {
          ...profileData[parent as keyof ProfileData],
          [child]: value
        }
      })
    } else {
      setProfileData({
        ...profileData,
        [field]: value
      })
    }
  }

  const getVerificationBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <span className="verification-badge verified">✓ Verified</span>
      case 'pending':
        return <span className="verification-badge pending">⏳ Pending</span>
      case 'rejected':
        return <span className="verification-badge rejected">✗ Rejected</span>
      default:
        return null
    }
  }

  const getTrustScoreColor = (score: number) => {
    if (score >= 4.5) return 'excellent'
    if (score >= 4.0) return 'good'
    if (score >= 3.0) return 'average'
    return 'poor'
  }

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    )
  }

  if (!profileData) {
    return (
      <div className="profile-error">
        <p>No profile data available</p>
        <button onClick={() => window.location.reload()} className="btn bg-primary text-white">
          Refresh Page
        </button>
      </div>
    )
  }

  return (
    <div className="profile">
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
        <p className="page-subtitle">Manage your account information and preferences</p>
      </div>

      <div className="profile-layout">
        {/* Profile Summary Card */}
        <div className="profile-summary-card">
          <div className="profile-avatar">
            {profileData.name.charAt(0).toUpperCase()}
          </div>
          <div className="profile-summary-content">
            <h2 className="profile-name">{profileData.name}</h2>
            <p className="profile-business-type">
              {businessTypes.find(type => type.value === profileData.businessType)?.label}
            </p>
            {getVerificationBadge(profileData.verificationStatus)}
            <div className={`trust-score ${getTrustScoreColor(profileData.trustScore)}`}>
              <span className="trust-label">Trust Score:</span>
              <span className="trust-value">{profileData.trustScore.toFixed(1)}/5.0</span>
            </div>
          </div>
          <div className="profile-actions">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)}
                className="btn bg-primary text-white"
              >
                Edit Profile
              </button>
            ) : (
              <div className="edit-actions">
                <button 
                  onClick={saveProfile}
                  disabled={saving}
                  className="btn bg-success text-white"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="btn bg-secondary text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Profile Details */}
        <div className="profile-details">
          <div className="profile-section">
            <h3 className="section-title">Personal Information</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Full Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                  />
                ) : (
                  <div className="form-value">{profileData.name}</div>
                )}
              </div>

              <div className="form-group">
                <label>Email</label>
                <div className="form-value">{profileData.email}</div>
              </div>

              <div className="form-group">
                <label>Phone</label>
                {isEditing ? (
                  <input
                    type="tel"
                    value={profileData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                  />
                ) : (
                  <div className="form-value">{profileData.phone}</div>
                )}
              </div>

              <div className="form-group">
                <label>Business Type</label>
                {isEditing ? (
                  <select
                    value={profileData.businessType}
                    onChange={(e) => handleInputChange('businessType', e.target.value)}
                  >
                    {businessTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="form-value">
                    {businessTypes.find(type => type.value === profileData.businessType)?.label}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3 className="section-title">Location</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>State</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.location.state}
                    onChange={(e) => handleInputChange('location.state', e.target.value)}
                  />
                ) : (
                  <div className="form-value">{profileData.location.state}</div>
                )}
              </div>

              <div className="form-group">
                <label>District</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.location.district}
                    onChange={(e) => handleInputChange('location.district', e.target.value)}
                  />
                ) : (
                  <div className="form-value">{profileData.location.district}</div>
                )}
              </div>

              <div className="form-group">
                <label>Market</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={profileData.location.market}
                    onChange={(e) => handleInputChange('location.market', e.target.value)}
                  />
                ) : (
                  <div className="form-value">{profileData.location.market}</div>
                )}
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3 className="section-title">Language Preferences</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Primary Language</label>
                {isEditing ? (
                  <select
                    value={profileData.preferredLanguage}
                    onChange={(e) => handleInputChange('preferredLanguage', e.target.value)}
                  >
                    {languages.map(lang => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="form-value">
                    {languages.find(lang => lang.code === profileData.preferredLanguage)?.name}
                  </div>
                )}
              </div>

              <div className="form-group full-width">
                <label>Secondary Languages</label>
                {isEditing ? (
                  <div className="language-checkboxes">
                    {languages
                      .filter(lang => lang.code !== profileData.preferredLanguage)
                      .map(lang => (
                        <label key={lang.code} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={profileData.secondaryLanguages.includes(lang.code)}
                            onChange={(e) => {
                              const newSecondary = e.target.checked
                                ? [...profileData.secondaryLanguages, lang.code]
                                : profileData.secondaryLanguages.filter(l => l !== lang.code)
                              handleInputChange('secondaryLanguages', newSecondary)
                            }}
                          />
                          {lang.name}
                        </label>
                      ))}
                  </div>
                ) : (
                  <div className="form-value">
                    {profileData.secondaryLanguages.length > 0
                      ? profileData.secondaryLanguages
                          .map(code => languages.find(lang => lang.code === code)?.name)
                          .join(', ')
                      : 'None selected'
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Account Actions */}
        <div className="account-actions">
          <h3 className="section-title">Account Actions</h3>
          <div className="action-buttons">
            <button className="btn bg-warning text-dark">
              Change Password
            </button>
            <button className="btn bg-danger text-white" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Profile