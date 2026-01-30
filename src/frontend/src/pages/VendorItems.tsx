import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import './VendorItems.css'

interface VendorItem {
  id: string
  name: string
  category: string
  description: string
  price: number
  unit: string
  quantity: number
  quality: 'premium' | 'standard' | 'economy'
  location: string
  images: string[]
  status: 'active' | 'inactive' | 'sold_out'
  createdAt: string
  updatedAt: string
}

interface ItemFormData {
  name: string
  category: string
  description: string
  price: number
  unit: string
  quantity: number
  quality: 'premium' | 'standard' | 'economy'
  location: string
}

const VendorItems: React.FC = () => {
  const { user } = useAuth()
  const [items, setItems] = useState<VendorItem[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingItem, setEditingItem] = useState<VendorItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState<ItemFormData>({
    name: '',
    category: '',
    description: '',
    price: 0,
    unit: 'kg',
    quantity: 1,
    quality: 'standard',
    location: ''
  })

  const categories = [
    'Rice', 'Wheat', 'Cotton', 'Onion', 'Potato', 'Tomato',
    'Sugarcane', 'Maize', 'Turmeric', 'Chillies', 'Pulses',
    'Vegetables', 'Fruits', 'Spices', 'Other'
  ]

  const units = ['kg', 'quintal', 'ton', 'bag', 'box', 'piece']
  const qualities = [
    { value: 'premium', label: 'Premium Quality' },
    { value: 'standard', label: 'Standard Quality' },
    { value: 'economy', label: 'Economy Quality' }
  ]

  useEffect(() => {
    loadVendorItems()
  }, [])

  const loadVendorItems = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        // Mock data for demo
        const mockItems: VendorItem[] = [
          {
            id: '1',
            name: 'Basmati Rice',
            category: 'Rice',
            description: 'Premium quality basmati rice from Punjab',
            price: 2500,
            unit: 'quintal',
            quantity: 50,
            quality: 'premium',
            location: 'Punjab Market',
            images: [],
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          },
          {
            id: '2',
            name: 'Red Onions',
            category: 'Onion',
            description: 'Fresh red onions, good for storage',
            price: 1200,
            unit: 'quintal',
            quantity: 100,
            quality: 'standard',
            location: 'Maharashtra Market',
            images: [],
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
        setItems(mockItems)
        setLoading(false)
        return
      }

      const response = await fetch('/api/v1/vendor/items', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        setItems(data.items || [])
      } else {
        console.error('Failed to load vendor items')
      }
    } catch (error) {
      console.error('Error loading vendor items:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: keyof ItemFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      description: '',
      price: 0,
      unit: 'kg',
      quantity: 1,
      quality: 'standard',
      location: ''
    })
    setEditingItem(null)
    setShowAddForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // Validate form data
      if (!formData.name.trim()) {
        alert('Please enter item name')
        setSaving(false)
        return
      }
      
      if (!formData.category) {
        alert('Please select a category')
        setSaving(false)
        return
      }
      
      if (formData.price <= 0) {
        alert('Please enter a valid price greater than 0')
        setSaving(false)
        return
      }
      
      if (formData.quantity <= 0) {
        alert('Please enter a quantity greater than 0')
        setSaving(false)
        return
      }
      
      if (!formData.location.trim()) {
        alert('Please enter location')
        setSaving(false)
        return
      }

      console.log('Form data being submitted:', formData)

      const token = localStorage.getItem('accessToken')
      
      if (!token) {
        // Mock save for demo
        const newItem: VendorItem = {
          id: Date.now().toString(),
          ...formData,
          images: [],
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }

        console.log('Adding new item (mock):', newItem)

        if (editingItem) {
          setItems(prev => prev.map(item => 
            item.id === editingItem.id ? { ...newItem, id: editingItem.id } : item
          ))
        } else {
          setItems(prev => [...prev, newItem])
        }
        
        resetForm()
        setSaving(false)
        return
      }

      const url = editingItem 
        ? `/api/v1/vendor/items/${editingItem.id}`
        : '/api/v1/vendor/items'
      
      const method = editingItem ? 'PUT' : 'POST'

      console.log('Making API request:', { url, method, formData })

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      console.log('API response status:', response.status)

      if (response.ok) {
        const result = await response.json()
        console.log('API response data:', result)
        await loadVendorItems()
        resetForm()
      } else {
        const errorData = await response.json()
        console.error('API error:', errorData)
        alert(`Failed to save item: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error saving item:', error)
      alert('Failed to save item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: VendorItem) => {
    setFormData({
      name: item.name,
      category: item.category,
      description: item.description,
      price: item.price,
      unit: item.unit,
      quantity: item.quantity,
      quality: item.quality,
      location: item.location
    })
    setEditingItem(item)
    setShowAddForm(true)
  }

  const handleDelete = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return

    try {
      const token = localStorage.getItem('accessToken')
      
      if (!token) {
        // Mock delete for demo
        setItems(prev => prev.filter(item => item.id !== itemId))
        return
      }

      const response = await fetch(`/api/v1/vendor/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        setItems(prev => prev.filter(item => item.id !== itemId))
      } else {
        console.error('Failed to delete item')
      }
    } catch (error) {
      console.error('Error deleting item:', error)
    }
  }

  const toggleItemStatus = async (itemId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    
    try {
      const token = localStorage.getItem('accessToken')
      
      if (!token) {
        // Mock status toggle for demo
        setItems(prev => prev.map(item => 
          item.id === itemId ? { ...item, status: newStatus as any } : item
        ))
        return
      }

      const response = await fetch(`/api/v1/vendor/items/${itemId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      })

      if (response.ok) {
        setItems(prev => prev.map(item => 
          item.id === itemId ? { ...item, status: newStatus as any } : item
        ))
      } else {
        console.error('Failed to update item status')
      }
    } catch (error) {
      console.error('Error updating item status:', error)
    }
  }

  if (loading) {
    return (
      <div className="vendor-items-loading">
        <div className="spinner"></div>
        <p>Loading your items...</p>
      </div>
    )
  }

  return (
    <div className="vendor-items">
      <div className="page-header">
        <h1 className="page-title">My Items</h1>
        <p className="page-subtitle">Manage your inventory and listings</p>
        <button 
          className="btn bg-primary text-white"
          onClick={() => setShowAddForm(true)}
        >
          Add New Item
        </button>
      </div>

      {/* Add/Edit Item Form */}
      {showAddForm && (
        <div className="item-form-overlay">
          <div className="item-form-modal">
            <div className="form-header">
              <h2>{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
              <button 
                className="close-btn"
                onClick={resetForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="item-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Item Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    required
                    placeholder="e.g., Basmati Rice"
                  />
                </div>

                <div className="form-group">
                  <label>Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    required
                  >
                    <option value="">Select Category</option>
                    {categories.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Price per Unit *</label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value)
                      handleInputChange('price', isNaN(value) ? 0 : value)
                    }}
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="Enter price (e.g., 2500.00)"
                  />
                </div>

                <div className="form-group">
                  <label>Unit *</label>
                  <select
                    value={formData.unit}
                    onChange={(e) => handleInputChange('unit', e.target.value)}
                    required
                  >
                    {units.map(unit => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Available Quantity *</label>
                  <input
                    type="number"
                    value={formData.quantity || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseInt(e.target.value)
                      handleInputChange('quantity', isNaN(value) ? 0 : value)
                    }}
                    required
                    min="1"
                    placeholder="Enter quantity (e.g., 50)"
                  />
                </div>

                <div className="form-group">
                  <label>Quality Grade *</label>
                  <select
                    value={formData.quality}
                    onChange={(e) => handleInputChange('quality', e.target.value as any)}
                    required
                  >
                    {qualities.map(quality => (
                      <option key={quality.value} value={quality.value}>
                        {quality.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group full-width">
                  <label>Location *</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    required
                    placeholder="e.g., Punjab Market, Sector 26"
                  />
                </div>

                <div className="form-group full-width">
                  <label>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={3}
                    placeholder="Describe your item quality, origin, storage conditions, etc."
                  />
                </div>
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn bg-secondary text-white"
                  onClick={resetForm}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn bg-primary text-white"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (editingItem ? 'Update Item' : 'Add Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="items-grid">
        {items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No items yet</h3>
            <p>Start by adding your first item to the marketplace</p>
            <button 
              className="btn bg-primary text-white"
              onClick={() => setShowAddForm(true)}
            >
              Add Your First Item
            </button>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-header">
                <h3 className="item-name">{item.name}</h3>
                <div className={`item-status ${item.status}`}>
                  {item.status === 'active' ? '🟢' : '🔴'} {item.status}
                </div>
              </div>

              <div className="item-details">
                <div className="item-category">{item.category}</div>
                <div className="item-price">₹{item.price.toLocaleString()} per {item.unit}</div>
                <div className="item-quantity">Available: {item.quantity} {item.unit}</div>
                <div className="item-quality">Quality: {qualities.find(q => q.value === item.quality)?.label}</div>
                <div className="item-location">📍 {item.location}</div>
                {item.description && (
                  <div className="item-description">{item.description}</div>
                )}
              </div>

              <div className="item-actions">
                <button 
                  className="btn bg-warning text-dark"
                  onClick={() => handleEdit(item)}
                >
                  Edit
                </button>
                <button 
                  className={`btn ${item.status === 'active' ? 'bg-secondary' : 'bg-success'} text-white`}
                  onClick={() => toggleItemStatus(item.id, item.status)}
                >
                  {item.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button 
                  className="btn bg-danger text-white"
                  onClick={() => handleDelete(item.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default VendorItems