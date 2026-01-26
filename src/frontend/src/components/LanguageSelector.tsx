import React, { useState } from 'react'
import './LanguageSelector.css'

interface Language {
  code: string
  name: string
  nativeName: string
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' }
]

const LanguageSelector: React.FC = () => {
  const [selectedLanguage, setSelectedLanguage] = useState('en')
  const [isOpen, setIsOpen] = useState(false)

  const handleLanguageChange = (languageCode: string) => {
    setSelectedLanguage(languageCode)
    setIsOpen(false)
    
    // Save preference to localStorage and sync with backend
    localStorage.setItem('preferredLanguage', languageCode)
    
    // TODO: Sync with backend API
    // updateUserPreference('language', languageCode)
  }

  const selectedLang = languages.find(lang => lang.code === selectedLanguage)

  return (
    <div className="language-selector">
      <button
        className="language-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Select language"
      >
        <span className="language-code">{selectedLang?.code.toUpperCase()}</span>
        <svg 
          className={`chevron ${isOpen ? 'rotated' : ''}`}
          width="12" 
          height="12" 
          viewBox="0 0 12 12"
        >
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        </svg>
      </button>
      
      {isOpen && (
        <div className="language-dropdown" role="listbox">
          {languages.map((language) => (
            <button
              key={language.code}
              className={`language-option ${selectedLanguage === language.code ? 'selected' : ''}`}
              onClick={() => handleLanguageChange(language.code)}
              role="option"
              aria-selected={selectedLanguage === language.code}
            >
              <span className="language-native">{language.nativeName}</span>
              <span className="language-english">{language.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSelector