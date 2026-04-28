import React, { useEffect, useState } from 'react'
import { api } from '../api/client'
import { type AuthSession } from '../app/auth'
import {
  getDeliverySoundSettings,
  playNotificationSound,
  saveDeliverySoundSettings,
} from '../app/playNotificationSound'
import { normalizePublicMenuUrl } from '../app/publicMenuUrl'
import { Badge, Button, Card, Input, LoadingState, PageHeader, SectionHeader, Select, StatCard } from '../components/ui'
import { resolveAssetUrl } from '../app/runtime'

type StoreConfig = {
  store_name?: string
  company_name?: string | null
  logo_url?: string | null
  cnpj?: string | null
  address?: string | null
  whatsapp_number?: string | null
  public_menu_url?: string | null
  theme?: string
  points_per_real?: number
  point_value_real?: string
  min_redeem_points?: number
  printer?: {
    provider?: string
    agent_url?: string
    printer_name?: string
    width_mm?: number
    auto_print_receipt?: boolean
    auto_print_kitchen?: boolean
  }
  scale?: {
    enabled?: boolean
    com_port?: string
    baud?: number
    timeout_ms?: number
  }
  category_images?: Record<string, string>
  pix_key?: string
  pix_fee_pct?: string
  card_fee_credit_pct?: string
  card_fee_debit_pct?: string
  delivery_fee_default?: string
  delivery_fee_rules?: Array<{
    label?: string
    neighborhood?: string
    fee?: string
  }>
  delivery_integration?: {
    enabled?: boolean
    provider?: string
    integration_token?: string
    merchant_id?: string
    pickup_location?: string
    default_payment_method?: string
    service_type?: string
    enable_dynamic_return?: boolean
    dispatch_after_seconds?: number
  }
}

type DeliveryFeeRuleForm = {
  id: string
  label: string
  fee: string
}

type Category = {
  id: number
  name: string
  price?: string | null
}

type CategoryPriceApplyResponse = {
  updated_products: number
}

type UploadImageResponse = {
  url: string
  relative_url: string
  slot: 'logo' | 'category'
  category_id?: string | null
}

type Role = {
  id: number
  name: string
  permission_codes: string[]
}

type ManagedUser = {
  id: number
  email: string
  name: string
  is_active: boolean
  is_staff: boolean
  is_superuser: boolean
  role_ids: number[]
  permission_codes: string[]
}

const normalizeTheme = (value?: string | null) => {
  if (!value || value === 'light') return 'cream'
  if (value === 'green' || value === 'blue' || value === 'cream') return value
  return 'cream'
}

const dispatchBrandingUpdate = (store_name: string, logo_url: string | null) => {
  window.dispatchEvent(new CustomEvent('sorveteria:branding', { detail: { store_name, logo_url } }))
}

const createDeliveryFeeRule = (label = '', fee = ''): DeliveryFeeRuleForm => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  label,
  fee,
})

const normalizeDeliveryFeeRules = (rules?: Array<{ label?: string; neighborhood?: string; fee?: string }>) => {
  const normalized = (rules ?? [])
    .map((rule) => {
      const label = String(rule.label || rule.neighborhood || '').trim()
      const fee = String(rule.fee || '').trim()
      return label || fee ? createDeliveryFeeRule(label, fee) : null
    })
    .filter((item): item is DeliveryFeeRuleForm => item !== null)
  return normalized.length > 0 ? normalized : [createDeliveryFeeRule()]
}

const buildDeliveryFeeRulesPayload = (rules: DeliveryFeeRuleForm[]) =>
  rules
    .map((rule) => ({
      label: rule.label.trim(),
      fee: rule.fee.trim().replace(',', '.'),
    }))
    .filter((rule) => rule.label && rule.fee)

const Configuracoes: React.FC = () => {
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryPrices, setCategoryPrices] = useState<Record<string, string>>({})
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>({})
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedCategoryImage, setSelectedCategoryImage] = useState<string>('')
  const [selectedCategoryPrice, setSelectedCategoryPrice] = useState<string>('')
  const [savingCategoryId, setSavingCategoryId] = useState<string>('')
  const [applyingCategoryId, setApplyingCategoryId] = useState<string>('')
  const [deletingCategoryId, setDeletingCategoryId] = useState<string>('')
  const [uploadingCategoryImage, setUploadingCategoryImage] = useState(false)
  const [uploadingLogoImage, setUploadingLogoImage] = useState(false)

  const [storeName, setStoreName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [address, setAddress] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [publicMenuUrl, setPublicMenuUrl] = useState('')
  const [pixKey, setPixKey] = useState('')
  const [pixFeePct, setPixFeePct] = useState('0.00')
  const [cardFeeCreditPct, setCardFeeCreditPct] = useState('0.00')
  const [cardFeeDebitPct, setCardFeeDebitPct] = useState('0.00')
  const [theme, setTheme] = useState('cream')
  const [deliveryFeeDefault, setDeliveryFeeDefault] = useState('10.00')
  const [deliveryFeeRules, setDeliveryFeeRules] = useState<DeliveryFeeRuleForm[]>([createDeliveryFeeRule()])
  const [deliveryIntegrationEnabled, setDeliveryIntegrationEnabled] = useState(false)
  const [deliveryIntegrationToken, setDeliveryIntegrationToken] = useState('')
  const [deliveryIntegrationMerchantId, setDeliveryIntegrationMerchantId] = useState('')
  const [deliveryIntegrationPickupLocation, setDeliveryIntegrationPickupLocation] = useState('')
  const [deliveryIntegrationDefaultPaymentMethod, setDeliveryIntegrationDefaultPaymentMethod] = useState('')
  const [deliveryIntegrationServiceType, setDeliveryIntegrationServiceType] = useState('automatico')
  const [deliveryIntegrationDynamicReturn, setDeliveryIntegrationDynamicReturn] = useState(true)
  const [deliveryIntegrationDispatchAfterSeconds, setDeliveryIntegrationDispatchAfterSeconds] = useState('120')
  const [deliverySoundEnabled, setDeliverySoundEnabled] = useState(true)
  const [deliverySoundVolume, setDeliverySoundVolume] = useState('72')

  const [agentUrl, setAgentUrl] = useState('http://127.0.0.1:9876')
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(true)
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(false)
  const [comPort, setComPort] = useState('COM3')
  const [baud, setBaud] = useState('9600')
  const [scaleEnabled, setScaleEnabled] = useState(true)

  const [pointsPerReal, setPointsPerReal] = useState('1')
  const [pointValueReal, setPointValueReal] = useState('0.10')
  const [minRedeemPoints, setMinRedeemPoints] = useState('10')

  const [canManageUsers, setCanManageUsers] = useState(false)
  const [roles, setRoles] = useState<Role[]>([])
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userIsActive, setUserIsActive] = useState(true)
  const [userIsStaff, setUserIsStaff] = useState(false)
  const [userRoleIds, setUserRoleIds] = useState<number[]>([])

  const resetUserForm = () => {
    setEditingUserId(null)
    setUserName('')
    setUserEmail('')
    setUserPassword('')
    setUserIsActive(true)
    setUserIsStaff(false)
    setUserRoleIds([])
  }

  const loadConfig = async () => {
    try {
      const deliverySoundSettings = getDeliverySoundSettings()
      const [configResponse, categoriesResponse, sessionResponse, rolesResponse, usersResponse] = await Promise.all([
        api.get<StoreConfig>('/api/config'),
        api.get<Category[]>('/api/categories'),
        api.get<AuthSession>('/api/auth/session').catch(() => ({ data: null as AuthSession | null })),
        api.get<Role[]>('/api/auth/roles').catch(() => ({ data: [] as Role[] })),
        api.get<ManagedUser[]>('/api/auth/users').catch(() => ({ data: [] as ManagedUser[] }))
      ])
      const cfg = configResponse.data
      setStoreName(cfg.store_name || '')
      setCompanyName(cfg.company_name || '')
      setLogoUrl(cfg.logo_url || '')
      setCnpj(cfg.cnpj || '')
      setAddress(cfg.address || '')
      setWhatsappNumber(cfg.whatsapp_number || '')
      setPublicMenuUrl(cfg.public_menu_url ? normalizePublicMenuUrl(cfg.public_menu_url) : '')
      setPixKey(cfg.pix_key || '')
      setPixFeePct(String(cfg.pix_fee_pct ?? '0.00'))
      setCardFeeCreditPct(String(cfg.card_fee_credit_pct ?? '0.00'))
      setCardFeeDebitPct(String(cfg.card_fee_debit_pct ?? '0.00'))
      setTheme(normalizeTheme(cfg.theme))
      setDeliveryFeeDefault(String(cfg.delivery_fee_default ?? '10.00'))
      setDeliveryFeeRules(normalizeDeliveryFeeRules(cfg.delivery_fee_rules))
      setDeliveryIntegrationEnabled(Boolean(cfg.delivery_integration?.enabled ?? false))
      setDeliveryIntegrationToken(cfg.delivery_integration?.integration_token || cfg.delivery_integration?.auth_token || '')
      setDeliveryIntegrationMerchantId(cfg.delivery_integration?.merchant_id || '')
      setDeliveryIntegrationPickupLocation(cfg.delivery_integration?.pickup_location || '')
      setDeliveryIntegrationDefaultPaymentMethod(cfg.delivery_integration?.default_payment_method || '')
      setDeliveryIntegrationServiceType(cfg.delivery_integration?.service_type || 'automatico')
      setDeliveryIntegrationDynamicReturn(Boolean(cfg.delivery_integration?.enable_dynamic_return ?? true))
      setDeliveryIntegrationDispatchAfterSeconds(String(cfg.delivery_integration?.dispatch_after_seconds ?? 120))
      setDeliverySoundEnabled(deliverySoundSettings.enabled)
      setDeliverySoundVolume(String(deliverySoundSettings.volume))
      setPointsPerReal(String(cfg.points_per_real ?? 1))
      setPointValueReal(String(cfg.point_value_real ?? '0.10'))
      setMinRedeemPoints(String(cfg.min_redeem_points ?? 10))
      setAgentUrl(cfg.printer?.agent_url || 'http://127.0.0.1:9876')
      setAutoPrintReceipt(Boolean(cfg.printer?.auto_print_receipt ?? true))
      setAutoPrintKitchen(Boolean(cfg.printer?.auto_print_kitchen ?? false))
      setSelectedPrinter(cfg.printer?.printer_name || 'auto')
      setComPort(cfg.scale?.com_port || 'COM3')
      setBaud(String(cfg.scale?.baud ?? 9600))
      setScaleEnabled(Boolean(cfg.scale?.enabled ?? true))
      setCategories(categoriesResponse.data)
      const nextCategoryPrices = Object.fromEntries(
        categoriesResponse.data.map((category) => [String(category.id), String(category.price || '')])
      )
      setCategoryPrices(nextCategoryPrices)
      setCategoryImages(cfg.category_images ?? {})
      const firstCategoryId = categoriesResponse.data[0]?.id
      if (firstCategoryId) {
        const key = String(firstCategoryId)
        setSelectedCategoryId(key)
        setSelectedCategoryImage((cfg.category_images ?? {})[key] ?? '')
        setSelectedCategoryPrice(nextCategoryPrices[key] ?? '')
      } else {
        setSelectedCategoryId('')
        setSelectedCategoryImage('')
        setSelectedCategoryPrice('')
      }
      const permissionCodes = sessionResponse.data?.user?.permission_codes ?? []
      setCanManageUsers(permissionCodes.includes('system.users.manage'))
      setRoles(rolesResponse.data)
      setUsers(usersResponse.data)
    } catch {
      setFeedback('Falha ao carregar configuracoes.')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    const response = await api.get<ManagedUser[]>('/api/auth/users')
    setUsers(response.data)
  }

  useEffect(() => {
    void loadConfig()
  }, [])

  useEffect(() => {
    const normalized = normalizeTheme(theme)
    document.documentElement.setAttribute('data-theme', normalized)
    window.dispatchEvent(new CustomEvent('sorveteria:theme', { detail: normalized }))
  }, [theme])

  const handleCategoryImageChange = (categoryId: number, value: string) => {
    setCategoryImages((prev) => ({
      ...prev,
      [String(categoryId)]: value
    }))
  }

  const handleSelectCategory = (value: string) => {
    setSelectedCategoryId(value)
    setSelectedCategoryImage(categoryImages[value] ?? '')
    setSelectedCategoryPrice(categoryPrices[value] ?? '')
  }

  const handleCategoryPriceChange = (categoryId: string, value: string) => {
    if (!categoryId) {
      setSelectedCategoryPrice(value)
      return
    }
    setCategoryPrices((prev) => ({
      ...prev,
      [categoryId]: value
    }))
    if (selectedCategoryId === categoryId) {
      setSelectedCategoryPrice(value)
    }
  }

  const handlePickCategoryImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedCategoryId) {
      return
    }
    void uploadConfigImage(file, selectedCategoryId)
    event.target.value = ''
  }

  const handlePickLogoImage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    void uploadConfigImage(file)
    event.target.value = ''
  }

  const handleClearLogoImage = () => {
    setLogoUrl('')
    setFeedback('Logo removida. Clique em salvar para confirmar a alteracao.')
  }

  const handleClearCategoryImage = async () => {
    if (!selectedCategoryId) {
      return
    }
    try {
      const next = { ...categoryImages }
      delete next[selectedCategoryId]
      await api.put('/api/config', {
        category_images: next
      })
      setSelectedCategoryImage('')
      setCategoryImages(next)
      setFeedback('Imagem da categoria removida com sucesso.')
    } catch {
      setFeedback('Falha ao remover imagem da categoria.')
    }
  }

  const handleSaveCategoryPrice = async () => {
    if (!selectedCategoryId) return
    await saveCategoryPrice(selectedCategoryId)
  }

  const saveCategoryPrice = async (categoryId: string) => {
    try {
      setSavingCategoryId(categoryId)
      const nextPrice = categoryPrices[categoryId] ?? ''
      await api.put(`/api/categories/${categoryId}`, {
        price: nextPrice.replace(',', '.') || null
      })
      setCategories((prev) => prev.map((category) => (String(category.id) === categoryId ? { ...category, price: nextPrice } : category)))
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryPrice(nextPrice)
      }
      setFeedback('Preco da categoria salvo com sucesso.')
    } catch {
      setFeedback('Falha ao salvar preco da categoria.')
    } finally {
      setSavingCategoryId('')
    }
  }

  const handleApplyCategoryPrice = async (categoryId: string) => {
    try {
      setApplyingCategoryId(categoryId)
      const nextPrice = (categoryPrices[categoryId] ?? '').trim()
      const response = await api.post<CategoryPriceApplyResponse>(`/api/categories/${categoryId}/apply-price`, {
        price: nextPrice.replace(',', '.') || '0'
      })
      setCategories((prev) =>
        prev.map((category) => (String(category.id) === categoryId ? { ...category, price: nextPrice } : category))
      )
      if (selectedCategoryId === categoryId) {
        setSelectedCategoryPrice(nextPrice)
      }
      setFeedback(`Preco aplicado em ${response.data.updated_products} produto(s) da categoria.`)
    } catch {
      setFeedback('Falha ao aplicar o preco da categoria nos produtos.')
    } finally {
      setApplyingCategoryId('')
    }
  }

  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find((item) => String(item.id) === categoryId)
    if (!category) {
      setFeedback('Categoria nao encontrada.')
      return
    }
    const confirmed = window.confirm(`Excluir a categoria "${category.name}"? Essa acao nao pode ser desfeita.`)
    if (!confirmed) {
      return
    }

    try {
      setDeletingCategoryId(categoryId)
      await api.delete(`/api/categories/${categoryId}`)

      const nextCategories = categories.filter((item) => String(item.id) !== categoryId)
      const nextCategoryPrices = { ...categoryPrices }
      delete nextCategoryPrices[categoryId]
      const nextCategoryImages = { ...categoryImages }
      delete nextCategoryImages[categoryId]

      setCategories(nextCategories)
      setCategoryPrices(nextCategoryPrices)
      setCategoryImages(nextCategoryImages)

      if (selectedCategoryId === categoryId) {
        const nextSelectedCategoryId = nextCategories[0] ? String(nextCategories[0].id) : ''
        setSelectedCategoryId(nextSelectedCategoryId)
        setSelectedCategoryImage(nextSelectedCategoryId ? nextCategoryImages[nextSelectedCategoryId] ?? '' : '')
        setSelectedCategoryPrice(nextSelectedCategoryId ? nextCategoryPrices[nextSelectedCategoryId] ?? '' : '')
      }

      setFeedback('Categoria excluida com sucesso.')
    } catch (error: unknown) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail === 'string'
          ? (error as { response: { data: { detail: string } } }).response.data.detail
          : 'Falha ao excluir categoria.'
      setFeedback(message)
    } finally {
      setDeletingCategoryId('')
    }
  }

  const handleSave = async () => {
    try {
      const normalizedCategoryImages: Record<string, string> = {}
      Object.entries(categoryImages).forEach(([key, value]) => {
        const normalized = value.trim()
        if (normalized) {
          normalizedCategoryImages[key] = normalized
        }
      })

      await api.put('/api/config', {
        store_name: storeName,
        company_name: companyName,
        logo_url: logoUrl.trim() || null,
        cnpj,
        address,
        whatsapp_number: whatsappNumber.trim() || null,
        public_menu_url: publicMenuUrl.trim() ? normalizePublicMenuUrl(publicMenuUrl) : null,
        pix_key: pixKey,
        pix_fee_pct: pixFeePct.replace(',', '.') || '0',
        card_fee_credit_pct: cardFeeCreditPct.replace(',', '.') || '0',
        card_fee_debit_pct: cardFeeDebitPct.replace(',', '.') || '0',
        delivery_fee_default: deliveryFeeDefault.replace(',', '.') || '0',
        delivery_fee_rules: buildDeliveryFeeRulesPayload(deliveryFeeRules),
        delivery_integration: {
          enabled: deliveryIntegrationEnabled,
          provider: 'entregas_expressas',
          integration_token: deliveryIntegrationToken.trim(),
          merchant_id: deliveryIntegrationMerchantId.trim(),
          pickup_location: deliveryIntegrationPickupLocation.trim(),
          default_payment_method: deliveryIntegrationDefaultPaymentMethod.trim(),
          service_type: deliveryIntegrationServiceType,
          enable_dynamic_return: deliveryIntegrationDynamicReturn,
          dispatch_after_seconds: Number(deliveryIntegrationDispatchAfterSeconds) || 120,
        },
        theme: normalizeTheme(theme),
        points_per_real: Number(pointsPerReal) || 1,
        point_value_real: pointValueReal.replace(',', '.'),
        min_redeem_points: Number(minRedeemPoints) || 0,
        printer: {
          provider: 'AGENT',
          agent_url: agentUrl,
          printer_name: selectedPrinter,
          width_mm: 80,
          auto_print_receipt: autoPrintReceipt,
          auto_print_kitchen: autoPrintKitchen
        },
        scale: {
          enabled: scaleEnabled,
          com_port: comPort,
          baud: Number(baud) || 9600,
          timeout_ms: 800
        },
        category_images: normalizedCategoryImages
      })
      saveDeliverySoundSettings({
        enabled: deliverySoundEnabled,
        volume: Number(deliverySoundVolume) || 0,
      })
      window.dispatchEvent(new CustomEvent('sorveteria:theme', { detail: normalizeTheme(theme) }))
      dispatchBrandingUpdate(storeName, logoUrl.trim() || null)
      setFeedback('Configuracoes salvas com sucesso.')
    } catch {
      setFeedback('Falha ao salvar configuracoes.')
    }
  }

  const persistCategoryImages = async (nextCategoryImages: Record<string, string>) => {
    await api.put('/api/config', {
      category_images: nextCategoryImages,
    })
  }

  const persistLogoUrl = async (nextLogoUrl: string) => {
    await api.put('/api/config', {
      logo_url: nextLogoUrl.trim() || null,
    })
  }

  const uploadConfigImage = async (file: File, categoryId?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('slot', categoryId ? 'category' : 'logo')
    if (categoryId) {
      formData.append('category_id', categoryId)
    }
    if (categoryId) {
      setUploadingCategoryImage(true)
    } else {
      setUploadingLogoImage(true)
    }

    try {
      const response = await api.post<UploadImageResponse>('/api/config/upload-image', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      if (categoryId) {
        const nextCategoryImages = {
          ...categoryImages,
          [categoryId]: response.data.relative_url
        }
        await persistCategoryImages(nextCategoryImages)
        setSelectedCategoryImage(response.data.relative_url)
        handleCategoryImageChange(Number(categoryId), response.data.relative_url)
        setFeedback('Imagem da categoria enviada e salva com sucesso.')
      } else {
        await persistLogoUrl(response.data.relative_url)
        setLogoUrl(response.data.relative_url)
        dispatchBrandingUpdate(storeName || 'Sorveteria POS', response.data.relative_url)
        setFeedback('Logo enviada e salva com sucesso.')
      }
    } catch {
      setFeedback(categoryId ? 'Falha ao enviar imagem da categoria.' : 'Falha ao enviar logo da empresa.')
    } finally {
      if (categoryId) {
        setUploadingCategoryImage(false)
      } else {
        setUploadingLogoImage(false)
      }
    }
  }

  const [printers, setPrinters] = useState<{ name: string, id: string }[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState('auto')

  const handleTestDeliverySound = () => {
    saveDeliverySoundSettings({
      enabled: deliverySoundEnabled,
      volume: Number(deliverySoundVolume) || 0,
    })
    playNotificationSound()
    setFeedback('Sinal sonoro de delivery testado neste navegador.')
  }

  const handleFetchPrinters = async () => {
    if (!agentUrl.trim()) {
      setFeedback('Informe o Agent URL.')
      return
    }
    try {
      const url = `${agentUrl.replace(/\/$/, '')}/printers`
      const response = await fetch(url)
      const data = await response.json()
      if (Array.isArray(data)) {
        setPrinters(data)
        setFeedback(`${data.length} impressoras encontradas.`)
      } else {
        setFeedback('Erro ao buscar impressoras.')
      }
    } catch {
      setFeedback('Nao foi possivel conectar ao Agent URL para buscar impressoras.')
    }
  }

  const handleTestScale = async () => {
    if (!agentUrl.trim()) {
      setFeedback('Informe o Agent URL.')
      return
    }
    try {
      const baseUrl = agentUrl.replace(/\/$/, '')
      const response = await fetch(`${baseUrl}/scale/weight`)
      if (!response.ok) {
        setFeedback('Agent respondeu com erro no teste de balanca.')
        return
      }
      const data = await response.json()
      if (data.grams === null) {
          // Se nao tiver peso real, vamos simular um para o teste ser funcional
          await fetch(`${baseUrl}/scale/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ simulate: true, grams: 500 })
          })
          setFeedback('Balanca simulada em 500g para teste. Verifique no PDV.')
      } else {
          setFeedback(`Balanca online: ${data.grams}g detectados.`)
      }
    } catch {
      setFeedback('Nao foi possivel conectar ao Agent URL informado.')
    }
  }

  const toggleUserRole = (roleId: number) => {
    setUserRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    )
  }

  const handleEditUser = (user: ManagedUser) => {
    setEditingUserId(user.id)
    setUserName(user.name)
    setUserEmail(user.email)
    setUserPassword('')
    setUserIsActive(user.is_active)
    setUserIsStaff(user.is_staff)
    setUserRoleIds(user.role_ids)
  }

  const handleSaveUser = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      setFeedback('Preencha nome e login do usuario.')
      return
    }
    if (!editingUserId && !userPassword.trim()) {
      setFeedback('Informe uma senha para o novo usuario.')
      return
    }

    try {
      const payload = {
        name: userName.trim(),
        email: userEmail.trim(),
        password: userPassword.trim() || undefined,
        is_active: userIsActive,
        is_staff: userIsStaff,
        role_ids: userRoleIds
      }
      if (editingUserId) {
        await api.put(`/api/auth/users/${editingUserId}`, payload)
        setFeedback('Usuario atualizado com sucesso.')
      } else {
        await api.post('/api/auth/users', payload)
        setFeedback('Usuario criado com sucesso.')
      }
      await loadUsers()
      resetUserForm()
    } catch {
      setFeedback('Falha ao salvar usuario.')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    try {
      await api.delete(`/api/auth/users/${userId}`)
      setFeedback('Usuario removido com sucesso.')
      await loadUsers()
      if (editingUserId === userId) {
        resetUserForm()
      }
    } catch {
      setFeedback('Falha ao remover usuario.')
    }
  }

  const updateDeliveryFeeRule = (ruleId: string, field: 'label' | 'fee', value: string) => {
    setDeliveryFeeRules((current) =>
      current.map((rule) => (rule.id === ruleId ? { ...rule, [field]: value } : rule))
    )
  }

  const addDeliveryFeeRule = () => {
    setDeliveryFeeRules((current) => [...current, createDeliveryFeeRule()])
  }

  const removeDeliveryFeeRule = (ruleId: string) => {
    setDeliveryFeeRules((current) => {
      if (current.length === 1) {
        return [createDeliveryFeeRule()]
      }
      return current.filter((rule) => rule.id !== ruleId)
    })
  }

  const handleResetSales = async () => {
    const password = window.prompt(
      'ATENÇÃO: Isso irá apagar todo o histórico de vendas, caixas e pontos de fidelidade. ' +
      'Os produtos e categorias serão mantidos, e o estoque consumido por essas vendas será recomposto. ' +
      'Digite sua SENHA DE ACESSO para confirmar:'
    )
    
    if (!password) return

    if (!window.confirm('TEM CERTEZA? Esta ação não pode ser desfeita.')) return

    try {
      setLoading(true)
      const resp = await api.post('/api/maintenance/reset-sales', { password })
      setFeedback(resp.data.message || 'Banco de vendas resetado com sucesso.')
      alert('Sistema resetado com sucesso!')
      window.location.reload()
    } catch (error: any) {
      setFeedback(error.response?.data?.detail || 'Falha ao resetar banco de vendas.')
    } finally {
      setLoading(false)
    }
  }

  const configuredDeliveryRules = buildDeliveryFeeRulesPayload(deliveryFeeRules).length

  if (loading) {
    return (
      <Card className="mx-auto max-w-4xl p-6">
        <LoadingState
          title="Carregando configuracoes"
          description="Estamos preparando preferencias da loja, impressoras e integracoes."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operacao"
        title="Configuracoes"
        description="Centralize identidade da loja, dispositivos, delivery, fidelidade e usuarios em uma tela mais organizada e leve."
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge variant="brand">{categories.length} categoria{categories.length === 1 ? '' : 's'}</Badge>
            <Badge variant={deliveryIntegrationEnabled ? 'success' : 'neutral'}>
              Delivery {deliveryIntegrationEnabled ? 'automatico' : 'manual'}
            </Badge>
            <Badge variant={logoUrl ? 'info' : 'neutral'}>{logoUrl ? 'Logo carregada' : 'Sem logo'}</Badge>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} variant="success">
              Salvar configuracoes
            </Button>
            <Button onClick={() => void loadConfig()} variant="secondary">
              Recarregar
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Categorias" value={categories.length} description="Catalogo ativo na tela." tone="accent" />
        <StatCard label="Bairros com regra" value={configuredDeliveryRules} description="Taxas personalizadas cadastradas." />
        <StatCard label="Usuarios" value={users.length} description={canManageUsers ? 'Gestao liberada para este perfil.' : 'Visualizacao sem permissao de gestao.'} />
        <StatCard
          label="Tema atual"
          value={theme === 'green' ? 'Verde' : theme === 'blue' ? 'Azul' : 'Creme'}
          description="Visual aplicado no sistema."
        />
      </div>

      {feedback ? (
        <Card tone="accent" className="p-4">
          <p className="text-sm text-slate-700">{feedback}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Dados da loja"
          description="Atualize identidade, endereco e o link publico usado em bio, Instagram e WhatsApp."
        />
        <Input value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder="Nome da loja" label="Nome da loja" />
        <Input value={cnpj} onChange={(event) => setCnpj(event.target.value)} placeholder="CNPJ" label="CNPJ" />
        <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Razao social" label="Razao social" />
        <Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Endereco" label="Endereco" />
        <Input value={whatsappNumber} onChange={(event) => setWhatsappNumber(event.target.value)} placeholder="WhatsApp da empresa (com DDD)" label="WhatsApp" />
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Link publico do cardapio</label>
          <Input
            value={publicMenuUrl}
            onChange={(event) => setPublicMenuUrl(event.target.value)}
            placeholder="https://seudominio.com/cardapio"
          />
          <p className="text-xs text-slate-500">
            Use aqui o endereco que seus clientes abrem no navegador do Instagram, WhatsApp ou bio.
          </p>
        </div>
        <div className="space-y-3 rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm shadow-brand-100/40">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Logo da empresa</h3>
            <p className="text-xs text-slate-500">Envie uma imagem para representar a loja no sistema.</p>
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handlePickLogoImage}
            disabled={uploadingLogoImage}
            className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-100 file:px-3 file:py-1 file:text-brand-700"
          />
          {uploadingLogoImage ? <p className="text-xs text-slate-500">Enviando logo...</p> : null}
          <div className="rounded-lg border border-brand-100 p-3">
            {logoUrl ? (
              <img src={resolveAssetUrl(logoUrl)} alt="Logo da empresa" className="h-24 w-24 rounded-lg object-cover" />
            ) : (
              <p className="text-sm text-slate-500">Nenhuma logo cadastrada.</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleClearLogoImage}
            disabled={!logoUrl}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm text-rose-700 disabled:opacity-50"
          >
            Remover logo
          </button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Tema do sistema"
          description="Escolha a variacao visual que melhor combina com a identidade da loja."
          meta={<Badge variant="info">Aplicado em tempo real</Badge>}
        />
        <Select
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
          label="Variacao de cor"
        >
          <option value="green">Verde</option>
          <option value="blue">Azul</option>
          <option value="cream">Creme</option>
        </Select>
        <Card tone="muted" className="p-4">
          <p className="text-sm text-slate-600">
            O tema ajuda a deixar o painel mais leve visualmente sem alterar o fluxo operacional.
          </p>
        </Card>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionHeader
          title="Alertas sonoros do delivery"
          description="Controle o aviso de novos pedidos neste navegador ou computador."
          meta={<Badge variant={deliverySoundEnabled ? 'success' : 'neutral'}>{deliverySoundEnabled ? 'Ativo' : 'Desligado'}</Badge>}
        />
        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={deliverySoundEnabled}
            onChange={(event) => setDeliverySoundEnabled(event.target.checked)}
          />
          Tocar sinal quando chegar novo pedido de delivery
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="delivery-sound-volume" className="text-sm font-medium text-slate-700">
              Volume do alerta
            </label>
            <span className="text-sm font-semibold text-slate-500">{deliverySoundVolume}%</span>
          </div>
          <input
            id="delivery-sound-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            value={deliverySoundVolume}
            onChange={(event) => setDeliverySoundVolume(event.target.value)}
            disabled={!deliverySoundEnabled}
            className="w-full accent-brand-600"
          />
          <p className="text-xs text-slate-500">
            Essa preferencia fica salva localmente neste navegador. Se usar outro computador, ajuste la tambem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleTestDeliverySound} variant="secondary" disabled={!deliverySoundEnabled || Number(deliverySoundVolume) <= 0}>
            Testar som
          </Button>
          <Button
            onClick={() => {
              setDeliverySoundEnabled(true)
              setDeliverySoundVolume('72')
            }}
            variant="ghost"
          >
            Restaurar padrao
          </Button>
        </div>
      </Card>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Impressora e Balanca</h2>
        <div className="flex gap-2">
          <input value={agentUrl} onChange={(event) => setAgentUrl(event.target.value)} className="flex-1 rounded-lg border border-brand-100 px-3 py-2" placeholder="Agent URL (ex: http://localhost:9876)" />
          <button onClick={() => void handleFetchPrinters()} className="rounded-lg bg-brand-100 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-200">
            Buscar Impressoras
          </button>
        </div>

        {printers.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Impressora Instalada</label>
            <select 
              value={selectedPrinter} 
              onChange={(e) => setSelectedPrinter(e.target.value)}
              className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2"
            >
              <option value="auto">Selecao Automatica</option>
              {printers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoPrintReceipt} onChange={(event) => setAutoPrintReceipt(event.target.checked)} />
          Imprimir comanda automaticamente apos a venda
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoPrintKitchen} onChange={(event) => setAutoPrintKitchen(event.target.checked)} />
          Imprimir pedido automaticamente na cozinha
        </label>
        
        <div className="pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Configuracao de Balanca</h3>
            <div className="flex gap-2">
              <input value={comPort} onChange={(event) => setComPort(event.target.value)} className="flex-1 rounded-lg border border-brand-100 px-3 py-2" placeholder="COM3" />
              <input value={baud} onChange={(event) => setBaud(event.target.value)} className="w-28 rounded-lg border border-brand-100 px-3 py-2" placeholder="9600" />
            </div>
        </div>

        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={scaleEnabled} onChange={(event) => setScaleEnabled(event.target.checked)} />
          Balanca habilitada
        </label>
        
        <div className="flex gap-2">
            <button onClick={() => void handleTestScale()} className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-white font-semibold shadow-sm hover:bg-brand-700">
              Testar Conexao / Simular Peso
            </button>
        </div>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Fidelidade</h2>
        <input value={pointsPerReal} onChange={(event) => setPointsPerReal(event.target.value)} className="w-full rounded-lg border border-brand-100 px-3 py-2" placeholder="Pontos por R$1" />
        <input value={pointValueReal} onChange={(event) => setPointValueReal(event.target.value)} className="w-full rounded-lg border border-brand-100 px-3 py-2" placeholder="Valor do ponto" />
        <input value={minRedeemPoints} onChange={(event) => setMinRedeemPoints(event.target.value)} className="w-full rounded-lg border border-brand-100 px-3 py-2" placeholder="Minimo resgate" />
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Taxas de cartao</h2>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Taxa de PIX (%)</label>
          <input
            value={pixFeePct}
            onChange={(event) => setPixFeePct(event.target.value)}
            className="w-full rounded-lg border border-brand-100 px-3 py-2"
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Taxa de credito (%)</label>
          <input
            value={cardFeeCreditPct}
            onChange={(event) => setCardFeeCreditPct(event.target.value)}
            className="w-full rounded-lg border border-brand-100 px-3 py-2"
            placeholder="0,00"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Taxa de debito (%)</label>
          <input
            value={cardFeeDebitPct}
            onChange={(event) => setCardFeeDebitPct(event.target.value)}
            className="w-full rounded-lg border border-brand-100 px-3 py-2"
            placeholder="0,00"
          />
        </div>
        <p className="text-xs text-slate-500">
          Essas taxas aparecem nos relatorios para mostrar o valor recebido e o valor liquido apos o desconto da maquina.
        </p>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Taxa de entrega</h2>
        <input
          value={deliveryFeeDefault}
          onChange={(event) => setDeliveryFeeDefault(event.target.value)}
          className="w-full rounded-lg border border-brand-100 px-3 py-2"
          placeholder="Taxa padrao para bairros sem regra"
        />
        <div className="space-y-2">
          {deliveryFeeRules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_auto]">
              <input
                value={rule.label}
                onChange={(event) => updateDeliveryFeeRule(rule.id, 'label', event.target.value)}
                className="w-full rounded-lg border border-brand-100 px-3 py-2"
                placeholder="Bairro"
              />
              <input
                value={rule.fee}
                onChange={(event) => updateDeliveryFeeRule(rule.id, 'fee', event.target.value)}
                className="w-full rounded-lg border border-brand-100 px-3 py-2"
                placeholder="Taxa"
              />
              <button
                type="button"
                onClick={() => removeDeliveryFeeRule(rule.id)}
                className="rounded-lg border border-rose-300 px-3 py-2 text-rose-700"
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addDeliveryFeeRule}
          className="rounded-lg border border-brand-200 px-3 py-2 text-sm font-semibold text-brand-700"
        >
          Adicionar bairro
        </button>
        <p className="text-xs text-slate-500">
          Cadastre os bairros atendidos e a taxa de cada um. Quando o bairro nao estiver listado, o sistema usa a taxa padrao acima.
        </p>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Entregas Expressas</h2>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deliveryIntegrationEnabled}
            onChange={(event) => setDeliveryIntegrationEnabled(event.target.checked)}
          />
          Enviar pedidos delivery automaticamente
        </label>
        <input
          value={deliveryIntegrationToken}
          onChange={(event) => setDeliveryIntegrationToken(event.target.value)}
          className="w-full rounded-lg border border-brand-100 px-3 py-2"
          placeholder="Token do PDV Integrado / Integrador"
        />
        <input
          value={deliveryIntegrationPickupLocation}
          onChange={(event) => setDeliveryIntegrationPickupLocation(event.target.value)}
          className="w-full rounded-lg border border-brand-100 px-3 py-2"
          placeholder="Local de coleta dos pedidos"
        />
        <input
          value={deliveryIntegrationMerchantId}
          onChange={(event) => setDeliveryIntegrationMerchantId(event.target.value)}
          className="w-full rounded-lg border border-brand-100 px-3 py-2"
          placeholder="Merchant/Store ID"
        />
        <select
          value={deliveryIntegrationDefaultPaymentMethod}
          onChange={(event) => setDeliveryIntegrationDefaultPaymentMethod(event.target.value)}
          className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2"
        >
          <option value="">Forma de pagamento padrao</option>
          <option value="pix">PIX</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="cartao">Cartao</option>
        </select>
        <select
          value={deliveryIntegrationServiceType}
          onChange={(event) => setDeliveryIntegrationServiceType(event.target.value)}
          className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2"
        >
          <option value="automatico">Automatico</option>
          <option value="manual">Manual</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deliveryIntegrationDynamicReturn}
            onChange={(event) => setDeliveryIntegrationDynamicReturn(event.target.checked)}
          />
          Habilitar retorno dinamico
        </label>
        <input
          value={deliveryIntegrationDispatchAfterSeconds}
          onChange={(event) => setDeliveryIntegrationDispatchAfterSeconds(event.target.value)}
          className="w-full rounded-lg border border-brand-100 px-3 py-2"
          placeholder="Chamar entregador apos quantos segundos"
        />
        <p className="text-xs text-slate-500">
          Cole aqui o token copiado no portal da Entregas Expressas. Pelo que vimos no painel deles, o mesmo token atende o fluxo de extensao e integrador.
        </p>
      </div>

      <div className="panel space-y-4 p-5 lg:col-span-2">
        <h2 className="font-semibold">Imagens das categorias (PDV)</h2>
        <p className="text-sm text-slate-500">Selecione a categoria e escolha uma imagem do computador.</p>
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[240px_1fr_180px_auto]">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Categoria</label>
            <select
              value={selectedCategoryId}
              onChange={(event) => handleSelectCategory(event.target.value)}
              className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm"
            >
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name} {category.price ? `(R$ ${category.price})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Arquivo de imagem</label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePickCategoryImage}
              disabled={!selectedCategoryId || uploadingCategoryImage}
              className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-brand-100 file:px-3 file:py-1 file:text-brand-700"
            />
            {uploadingCategoryImage ? <p className="text-xs text-slate-500">Enviando imagem...</p> : null}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Preço da Categoria</label>
            <div className="flex gap-1">
              <input
                value={selectedCategoryPrice}
                onChange={(e) => handleCategoryPriceChange(selectedCategoryId, e.target.value)}
                placeholder="R$ 0,00"
                className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleSaveCategoryPrice()}
                disabled={!selectedCategoryId || savingCategoryId === selectedCategoryId}
                className="rounded-lg bg-brand-100 px-3 py-2 text-xs font-bold text-brand-700 disabled:opacity-50"
              >
                {savingCategoryId === selectedCategoryId ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearCategoryImage}
            disabled={!selectedCategoryId || !selectedCategoryImage}
            className="h-10 rounded-lg border border-rose-300 px-3 text-rose-700 disabled:opacity-50"
          >
            Remover Imagem
          </button>
        </div>

        <div className="rounded-lg border border-brand-100 p-3">
          {selectedCategoryImage ? (
            <img src={resolveAssetUrl(selectedCategoryImage)} alt="Preview da categoria" className="h-24 w-24 rounded-lg object-cover" />
          ) : (
            <p className="text-sm text-slate-500">Nenhuma imagem selecionada para a categoria.</p>
          )}
        </div>
      </div>

      <div className="panel space-y-4 p-5 lg:col-span-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Precos por categoria</h2>
            <p className="text-sm text-slate-500">Defina o preco base da categoria e, se quiser, aplique o mesmo valor a todos os produtos dela.</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-brand-100">
          <table className="min-w-full text-sm">
            <thead className="bg-brand-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Preco base</th>
                <th className="px-3 py-2 text-right font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const categoryId = String(category.id)
                const savingThisRow = savingCategoryId === categoryId
                const applyingThisRow = applyingCategoryId === categoryId
                const deletingThisRow = deletingCategoryId === categoryId
                return (
                  <tr key={category.id} className="border-t border-brand-100">
                    <td className="px-3 py-3 font-medium text-slate-800">{category.name}</td>
                    <td className="px-3 py-3">
                      <input
                        value={categoryPrices[categoryId] ?? ''}
                        onChange={(event) => handleCategoryPriceChange(categoryId, event.target.value)}
                        placeholder="R$ 0,00"
                        className="w-full rounded-lg border border-brand-100 px-3 py-2 text-sm"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void saveCategoryPrice(categoryId)}
                          disabled={savingThisRow}
                          className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700 disabled:opacity-50"
                        >
                          {savingThisRow ? 'Salvando...' : 'Salvar categoria'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleApplyCategoryPrice(categoryId)}
                          disabled={applyingThisRow || deletingThisRow}
                          className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          {applyingThisRow ? 'Aplicando...' : 'Aplicar aos produtos'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(categoryId)}
                          disabled={deletingThisRow || savingThisRow || applyingThisRow}
                          className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50"
                        >
                          {deletingThisRow ? 'Excluindo...' : 'Excluir categoria'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canManageUsers ? (
        <div className="panel space-y-4 p-5 lg:col-span-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Usuarios e permissoes</h2>
              <p className="text-sm text-slate-500">Cadastre login e senha, depois vincule os perfis de acesso de cada usuario.</p>
            </div>
            <button
              type="button"
              onClick={resetUserForm}
              className="rounded-lg border border-brand-200 px-3 py-2 text-sm font-medium text-brand-700"
            >
              Novo usuario
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="responsive-table overflow-x-auto rounded-xl border border-brand-100">
              <table className="min-w-full text-sm">
                <thead className="bg-brand-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Nome</th>
                    <th className="px-3 py-2 font-medium">Login</th>
                    <th className="px-3 py-2 font-medium">Perfis</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const roleNames = roles
                      .filter((role) => user.role_ids.includes(role.id))
                      .map((role) => role.name)
                      .join(', ')
                    return (
                      <tr key={user.id} className="border-t border-brand-100">
                        <td className="px-3 py-3 font-medium text-slate-800">{user.name}</td>
                        <td className="px-3 py-3 text-slate-600">{user.email}</td>
                        <td className="px-3 py-3 text-slate-600">{roleNames || 'Sem perfil'}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditUser(user)}
                              className="rounded-lg border border-brand-200 px-3 py-1.5 text-brand-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteUser(user.id)}
                              className="rounded-lg border border-rose-300 px-3 py-1.5 text-rose-700"
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-brand-100 p-4">
              <h3 className="font-semibold text-slate-800">{editingUserId ? 'Editar usuario' : 'Novo usuario'}</h3>
              <div className="mt-4 grid gap-3">
                <input
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  className="w-full rounded-lg border border-brand-100 px-3 py-2"
                  placeholder="Nome do usuario"
                />
                <input
                  value={userEmail}
                  onChange={(event) => setUserEmail(event.target.value)}
                  className="w-full rounded-lg border border-brand-100 px-3 py-2"
                  placeholder="Login (e-mail)"
                />
                <input
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                  type="password"
                  className="w-full rounded-lg border border-brand-100 px-3 py-2"
                  placeholder={editingUserId ? 'Nova senha (opcional)' : 'Senha inicial'}
                />

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={userIsActive} onChange={(event) => setUserIsActive(event.target.checked)} />
                    Usuario ativo
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={userIsStaff} onChange={(event) => setUserIsStaff(event.target.checked)} />
                    Acesso administrativo
                  </label>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">Perfis</p>
                  <div className="grid gap-2">
                    {roles.map((role) => (
                      <label key={role.id} className="rounded-lg border border-brand-100 px-3 py-2 text-sm">
                        <span className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={userRoleIds.includes(role.id)}
                            onChange={() => toggleUserRole(role.id)}
                          />
                          <span>
                            <strong className="block text-slate-800">{role.name}</strong>
                            <span className="text-slate-500">{role.permission_codes.join(', ')}</span>
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveUser()}
                    className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    {editingUserId ? 'Salvar usuario' : 'Criar usuario'}
                  </button>
                  <button
                    type="button"
                    onClick={resetUserForm}
                    className="rounded-lg border border-brand-200 px-4 py-2 text-sm font-semibold text-brand-700"
                  >
                    Limpar
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Chave PIX (para automação Delivery)</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3"
                  placeholder="Seu CPF, CNPJ, E-mail ou Telefone"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold text-rose-700">Area de Perigo</h2>
        <p className="text-xs text-slate-500">Cuidado: As acoes abaixo sao irreversiveis.</p>
        <button
          onClick={() => void handleResetSales()}
          disabled={loading}
          className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          {loading ? 'Processando...' : 'Zerar Banco de Vendas'}
        </button>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-semibold">Acoes do sistema</h2>
        <p className="text-sm text-slate-500">Use estes atalhos para persistir alteracoes ou recarregar os dados vindos do servidor.</p>
        <Button onClick={() => void handleSave()} variant="success" fullWidth>
          Salvar configuracoes
        </Button>
        <Button onClick={() => void loadConfig()} variant="secondary" fullWidth>
          Recarregar
        </Button>
      </div>
    </div>
    </div>
  )
}

export default Configuracoes
