"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FiCheck, FiClipboard, FiCloud, FiDownload, FiEdit3, FiImage, FiLink, FiLoader, FiPackage, FiSave, FiSearch, FiUpload, FiZap } from "react-icons/fi"
import { toast } from "react-hot-toast"
import NextImage from "next/image"
import { calculatePromotionFinancials } from "@/lib/promotion-financials"

type SourceProduct = {
  sourceUrl: string; retailer: string; title: string; description: string; brand: string; model: string;
  sku: string; price: string; currency: string; imageUrl: string; availability: string; features: string[]
}
type Blade = { id: string; sku: string; name: string; description?: string; category: string; price: number; unitCost?: number; giftItem?: boolean; manufacturer?: string; vendor?: string; application?: string; size?: string; imageUrl?: string; catalogIds: string[] }
type Rep = { id: string; name: string; email: string; phone?: string }
type Campaign = { id: string; name: string; channel: string; content: string; imageUrl?: string }
type StudioOption = { id: string; label: string; description?: string; export?: "sms" | "email" }
type MediaReference = { id: string; title: string; url: string }
type FlyerCopy = { headline: string; subheadline: string; body: string; bullets: string[]; cta: string; smsCopy: string; emailSubject: string; emailPreheader: string }
type PromoForm = { name: string; sku: string; sellingPrice: string; bladeQuantity: string; giveawayCost: string; giveawayRetail: string; packagingCost: string; handlingCost: string; shippingEstimate: string; paymentFeePercent: string; tariffCost: string; vigCost: string; commissionCost: string; otherCost: string; freeShipping: boolean; accent: string }
type Promotion = { id: string; name: string; sku: string; status: string; zohoItemId?: string | null }

const blankProduct: SourceProduct = { sourceUrl: "", retailer: "", title: "", description: "", brand: "", model: "", sku: "", price: "", currency: "USD", imageUrl: "", availability: "", features: [] }
const blankCopy: FlyerCopy = {
  headline: "THE RIGHT BLADE FOR THE JOB",
  subheadline: "Professional cutting performance for demanding crews.",
  body: "Pair the jobsite material with a Titan Diamond blade built for clean, dependable cutting.",
  bullets: ["Contractor-focused performance", "Built for demanding applications", "Talk with your Titan rep for the right fit"],
  cta: "CALL YOUR TITAN REP TODAY", smsCopy: "Ask your Titan Diamond rep about the right blade for your next job.",
  emailSubject: "A better blade match for your next job", emailPreheader: "See the Titan Diamond recommendation selected for your application.",
}
const blankPromo: PromoForm = { name: "Contractor Pack Promotion", sku: `PROMO-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`, sellingPrice: "299.99", bladeQuantity: "1", giveawayCost: "0", giveawayRetail: "0", packagingCost: "5", handlingCost: "8", shippingEstimate: "25", paymentFeePercent: "3", tariffCost: "0", vigCost: "0", commissionCost: "0", otherCost: "0", freeShipping: true, accent: "#f97316" }

function parseBladeDescription(value?: string) {
  try { return JSON.parse(value || "{}") } catch { return { text: value || "" } }
}

function proxiedImage(url?: string) {
  if (!url) return ""
  if (url.startsWith("data:") || url.startsWith("/") || url.startsWith(location.origin)) return url
  return `/api/admin/flyer-studio/image?url=${encodeURIComponent(url)}`
}

function loadImage(url?: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null)
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = proxiedImage(url)
  })
}

async function imageDataUrl(url?: string) {
  const image = await loadImage(url)
  if (!image) return ""
  const canvas = document.createElement("canvas"); const max = 1400; const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", .9)
}

async function responseJson(response: Response) {
  const payload = await response.text()
  try { return JSON.parse(payload) }
  catch {
    const status = `${response.status} ${response.statusText}`.trim()
    throw new Error(`Flyer service returned ${status || "an invalid response"}. ${payload.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "Please retry in a moment."}`)
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word } else line = next
  }
  if (line) lines.push(line)
  return lines
}

function contain(ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.min(w / image.naturalWidth, h / image.naturalHeight)
  const dw = image.naturalWidth * ratio; const dh = image.naturalHeight * ratio
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

async function renderFlyer(canvas: HTMLCanvasElement, width: number, height: number, product: SourceProduct, blade: Blade | null, rep: Rep | null, copy: FlyerCopy, reference?: string, promo: PromoForm = blankPromo, value = 0, savings = 0, backgroundArt?: string) {
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext("2d")!; const s = width / 1200
  const accent = promo.accent || "#f97316"
  const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#050505"); gradient.addColorStop(.5, "#171717"); gradient.addColorStop(1, "#020202")
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  // Deterministic grit and sparks evoke the established contractor campaign style.
  for (let i = 0; i < 260; i++) { const x = ((i * 977) % 1193) * s; const y = ((i * 613) % 1493) * s; ctx.globalAlpha = .08 + (i % 5) * .025; ctx.fillStyle = i % 4 ? "#ffffff" : accent; ctx.fillRect(x, y, (i % 3 + 1) * s, (i % 7 + 2) * s) }
  ctx.globalAlpha = 1
  const [logo, sourceImage, bladeImage, artImage] = await Promise.all([
    loadImage("/images/brand/logo-system/titan-horizontal-light.png"), loadImage(product.imageUrl), loadImage(blade?.imageUrl), loadImage(backgroundArt),
  ])
  if (artImage) { ctx.save(); ctx.globalAlpha = .82; ctx.drawImage(artImage, 0, 0, width, height); ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, width, height); ctx.restore() }
  if (logo) contain(ctx, logo, 50 * s, 24 * s, 300 * s, 100 * s)
  ctx.textBaseline = "top"; ctx.textAlign = "right"; ctx.fillStyle = accent; ctx.font = `900 ${24 * s}px Arial Black, Arial`; ctx.fillText("LIMITED TIME CONTRACTOR OFFER", width - 50 * s, 62 * s)
  ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `900 ${79 * s}px Impact, Arial Black`; const headlines = wrap(ctx, copy.headline.toUpperCase(), width - 100 * s).slice(0, 2)
  headlines.forEach((line, i) => { ctx.strokeStyle = "#000"; ctx.lineWidth = 9 * s; ctx.strokeText(line, width / 2, (145 + i * 84) * s); ctx.fillText(line, width / 2, (145 + i * 84) * s) })
  let y = (145 + headlines.length * 84 + 10) * s
  ctx.fillStyle = accent; ctx.font = `900 ${31 * s}px Arial Black`; wrap(ctx, copy.subheadline.toUpperCase(), width - 110 * s).slice(0, 2).forEach((line, i) => ctx.fillText(line, width / 2, y + i * 38 * s))
  y += 100 * s; const panelY = y; const panelH = 470 * s
  ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.strokeStyle = accent; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.roundRect(40 * s, panelY, width - 80 * s, panelH, 18 * s); ctx.fill(); ctx.stroke()
  if (bladeImage) contain(ctx, bladeImage, 50 * s, panelY + 38 * s, 550 * s, 310 * s)
  else { ctx.save(); ctx.translate(325 * s, (panelY / s + 190) * s); ctx.strokeStyle = "#d7d7d7"; ctx.lineWidth = 24 * s; ctx.beginPath(); ctx.arc(0, 0, 126 * s, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, 34 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore() }
  if (sourceImage) contain(ctx, sourceImage, 610 * s, panelY + 32 * s, 530 * s, 320 * s)
  else { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.strokeStyle = accent; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.roundRect(690 * s, panelY + 70 * s, 370 * s, 220 * s, 26 * s); ctx.fill(); ctx.stroke(); ctx.textAlign = "center"; ctx.fillStyle = accent; ctx.font = `900 ${28 * s}px Arial Black`; ctx.fillText("BONUS PRODUCT", 875 * s, panelY + 120 * s); ctx.fillStyle = "#fff"; ctx.font = `800 ${20 * s}px Arial`; wrap(ctx, product.title || "GIFT IMAGE PENDING", 320 * s).slice(0, 3).forEach((line, i) => ctx.fillText(line.toUpperCase(), 875 * s, panelY + (174 + i * 27) * s)) }
  ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `900 ${29 * s}px Arial Black`; wrap(ctx, blade?.name || "TITAN DIAMOND BLADE", 500 * s).slice(0, 2).forEach((line, i) => ctx.fillText(line.toUpperCase(), 325 * s, panelY + (355 + i * 33) * s))
  ctx.fillStyle = accent; wrap(ctx, product.title || "CONTRACTOR GIVEAWAY", 490 * s).slice(0, 2).forEach((line, i) => ctx.fillText(line.toUpperCase(), 875 * s, panelY + (355 + i * 33) * s))
  y = panelY + panelH + 24 * s; ctx.fillStyle = accent; ctx.fillRect(40 * s, y, width - 80 * s, 92 * s)
  ctx.fillStyle = "#050505"; ctx.font = `900 ${44 * s}px Impact, Arial Black`; const price = Number(promo.sellingPrice || 0); ctx.fillText(price > 0 ? `$${price.toFixed(2)} PROMO` : "FREE BONUS WITH QUALIFYING ORDER", width / 2, y + 20 * s)
  y += 116 * s; ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = `800 ${22 * s}px Arial`
  const bullets = [...product.features, ...copy.bullets].filter(Boolean).slice(0, 3)
  bullets.forEach((bullet, i) => { ctx.fillStyle = accent; ctx.fillText("◆", 65 * s, y + i * 45 * s); ctx.fillStyle = "#fff"; wrap(ctx, bullet, 1010 * s).slice(0, 1).forEach((line) => ctx.fillText(line, 105 * s, y + i * 45 * s)) })
  if (value > 0) { y += 150 * s; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = `900 ${27 * s}px Arial Black`; ctx.fillText(`$${value.toFixed(2)} TOTAL VALUE  •  SAVE $${savings.toFixed(2)}`, width / 2, y) }
  const footerH = 180 * s; const footerY = height - footerH; ctx.fillStyle = accent; ctx.fillRect(0, footerY, width, footerH); ctx.fillStyle = "#050505"; ctx.textAlign = "center"; ctx.font = `900 ${33 * s}px Arial Black`; ctx.fillText(copy.cta.toUpperCase(), width / 2, footerY + 24 * s)
  ctx.font = `900 ${27 * s}px Arial`; ctx.fillText(`${(rep?.name || "YOUR TITAN SALES REP").toUpperCase()}  •  ${rep?.phone || "(480) 470-2577"}`, width / 2, footerY + 75 * s)
  ctx.font = `800 ${22 * s}px Arial`; ctx.fillText("TITAN DIAMOND USA  •  TDUSALES.COM", width / 2, footerY + 122 * s)
}

async function createExportCanvas(kind: "sms" | "email", product: SourceProduct, blade: Blade | null, rep: Rep | null, copy: FlyerCopy, reference?: string, promo: PromoForm = blankPromo, value = 0, savings = 0, backgroundArt?: string) {
  const source = document.createElement("canvas")
  await renderFlyer(source, 1200, 1500, product, blade, rep, copy, reference, promo, value, savings, backgroundArt)
  if (kind === "email") return source
  const sms = document.createElement("canvas"); sms.width = 1080; sms.height = 1350
  sms.getContext("2d")!.drawImage(source, 0, 0, 1080, 1350)
  return sms
}

export default function FlyerStudioPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true); const [scraping, setScraping] = useState(false); const [extractingScreenshot, setExtractingScreenshot] = useState(false); const [generating, setGenerating] = useState(false); const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState<Blade[]>([]); const [gifts, setGifts] = useState<Blade[]>([]); const [promotions, setPromotions] = useState<Promotion[]>([]); const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [reps, setReps] = useState<Rep[]>([]); const [savedReferences, setSavedReferences] = useState<MediaReference[]>([]); const [campaignTypes, setCampaignTypes] = useState<StudioOption[]>([])
  const [product, setProduct] = useState<SourceProduct>(blankProduct); const [bladeId, setBladeId] = useState(""); const [giftId, setGiftId] = useState(""); const [repId, setRepId] = useState(""); const [search, setSearch] = useState("")
  const [copy, setCopy] = useState<FlyerCopy>(blankCopy); const [references, setReferences] = useState<string[]>([]); const [campaignId, setCampaignId] = useState(""); const [campaignName, setCampaignName] = useState("Contractor Product Flyer"); const [channel, setChannel] = useState("SMS"); const [rendered, setRendered] = useState(false)
  const [promo, setPromo] = useState<PromoForm>(blankPromo); const [promotionId, setPromotionId] = useState(""); const [publishing, setPublishing] = useState(false); const [previewKind, setPreviewKind] = useState<"sms" | "email">("sms"); const [generatedFlyer, setGeneratedFlyer] = useState(""); const [imageGenerating, setImageGenerating] = useState(false); const [creationPrompt, setCreationPrompt] = useState(""); const [revisionPrompt, setRevisionPrompt] = useState("")
  const blade = products.find((item) => item.id === bladeId) || null; const gift = gifts.find((item) => item.id === giftId) || null; const rep = reps.find((item) => item.id === repId) || null
  const financials = useMemo(() => calculatePromotionFinancials({ sellingPrice: Number(promo.sellingPrice), bladeLines: blade ? [{ quantity: Number(promo.bladeQuantity), unitCost: Number(blade.unitCost || 0), unitRetail: Number(blade.price || 0) }] : [], giveawayCost: Number(promo.giveawayCost), giveawayRetail: Number(promo.giveawayRetail), packagingCost: Number(promo.packagingCost), handlingCost: Number(promo.handlingCost), shippingEstimate: Number(promo.shippingEstimate), freeShipping: promo.freeShipping, paymentFeePercent: Number(promo.paymentFeePercent), tariffCost: Number(promo.tariffCost), vigCost: Number(promo.vigCost), commissionCost: Number(promo.commissionCost), otherCost: Number(promo.otherCost) }), [promo, blade])
  const filteredProducts = useMemo(() => { const query = search.trim().toLowerCase(); if (!query) return products; return products.filter((item) => `${item.name} ${item.sku} ${item.category} ${item.application || ""} ${item.size || ""} ${item.manufacturer || ""} ${item.vendor || ""}`.toLowerCase().includes(query)) }, [products, search])

  useEffect(() => { fetch("/api/admin/flyer-studio/bootstrap").then((res) => res.json()).then((data) => { if (!data.success) throw new Error(data.error); setProducts(data.products || []); setGifts(data.gifts || []); setPromotions(data.promotionDrafts || []); setCampaigns(data.campaigns || []); setReps(data.reps || []); setSavedReferences(data.references || []); setCampaignTypes(data.campaignTypes || []) }).catch((error) => toast.error(error.message)).finally(() => setLoading(false)) }, [])

  const refreshPreview = useCallback(async () => { if (!canvasRef.current) return; const width = previewKind === "sms" ? 1080 : 1200; const height = previewKind === "sms" ? 1350 : 1500; if (generatedFlyer) { const image = await loadImage(generatedFlyer); if (image) { canvasRef.current.width = width; canvasRef.current.height = height; canvasRef.current.getContext("2d")!.drawImage(image, 0, 0, width, height); setRendered(true); return } } await renderFlyer(canvasRef.current, width, height, product, blade, rep, copy, references[0], promo, financials.customerValue, financials.customerSavings); setRendered(true) }, [product, blade, rep, copy, references, promo, financials, previewKind, generatedFlyer])
  useEffect(() => { if (!loading) { const timer = setTimeout(refreshPreview, 150); return () => clearTimeout(timer) } }, [loading, refreshPreview])

  async function scrape() {
    if (!product.sourceUrl) return toast.error("Paste a product URL first")
    setScraping(true)
    try { const res = await fetch("/api/admin/flyer-studio/scrape", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: product.sourceUrl }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setProduct((current) => ({ ...current, ...data.product, sourceUrl: data.product.sourceUrl || current.sourceUrl })); if (data.warning) toast(data.warning); else toast.success("Product details imported") } catch (error) { toast.error(error instanceof Error ? `${error.message}. You can enter the details manually.` : "Import failed") } finally { setScraping(false) }
  }
  function importProductScreenshotFile(file?: File) {
    if (!file) return
    if (!file.type.startsWith("image/") || file.size > 6_000_000) return toast.error("Use a JPG, PNG, or WebP screenshot under 6 MB")
    setExtractingScreenshot(true)
    const reader = new FileReader()
    reader.onerror = () => { setExtractingScreenshot(false); toast.error("The screenshot could not be read") }
    reader.onload = async () => {
      const screenshot = String(reader.result || "")
      try {
        const res = await fetch("/api/admin/flyer-studio/product-screenshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenshot, sourceUrl: product.sourceUrl }) })
        const data = await res.json(); if (!res.ok) throw new Error(data.error)
        setProduct((current) => ({ ...current, ...data.product, sourceUrl: current.sourceUrl, imageUrl: screenshot }))
        if (data.product.price) setPromo((current) => ({ ...current, giveawayRetail: data.product.price }))
        toast.success("Product details and image imported from screenshot")
      } catch (error) { toast.error(error instanceof Error ? error.message : "Screenshot extraction failed") } finally { setExtractingScreenshot(false) }
    }
    reader.readAsDataURL(file)
  }
  function importProductScreenshot(files: FileList | null) { importProductScreenshotFile(files?.[0]) }
  useEffect(() => {
    const pasteScreenshot = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items || [])].find((item) => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
      if (!file) return
      event.preventDefault()
      importProductScreenshotFile(file)
    }
    window.addEventListener("paste", pasteScreenshot)
    return () => window.removeEventListener("paste", pasteScreenshot)
  })
  function selectGift(id: string) {
    setGiftId(id); const selected = gifts.find((item) => item.id === id)
    if (!selected) return
    setProduct({ ...blankProduct, retailer: "Titan gift catalog", title: selected.name, description: selected.description || "", brand: selected.manufacturer || selected.vendor || "", sku: selected.sku, price: String(selected.price || ""), imageUrl: selected.imageUrl || "", features: [selected.application, selected.size, selected.category].filter(Boolean) as string[] })
    setPromo((current) => ({ ...current, giveawayCost: String(selected.unitCost || 0), giveawayRetail: String(selected.price || 0) }))
  }
  async function generateCopy() {
    if (!product.title || !blade || !rep) return toast.error("Add a product, blade, and sales rep first")
    setGenerating(true)
    try { const detail = parseBladeDescription(blade.description); const res = await fetch("/api/admin/flyer-studio/copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, blade: { ...blade, description: detail.text || blade.description }, rep, promotion: { sellingPrice: Number(promo.sellingPrice), customerValue: financials.customerValue, customerSavings: financials.customerSavings, freeShipping: promo.freeShipping, bladeQuantity: Number(promo.bladeQuantity) } }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setCopy({ ...blankCopy, ...data.copy }); if (data.warning) toast("Local AI was unavailable; safe copy was generated instead."); else toast.success(`Copy generated with ${data.provider}`) } catch (error) { toast.error(error instanceof Error ? error.message : "Copy generation failed") } finally { setGenerating(false) }
  }
  function uploadReferences(files: FileList | null) {
    if (!files) return; [...files].slice(0, 4 - references.length).forEach((file) => { if (!file.type.startsWith("image/") || file.size > 5_000_000) return toast.error(`${file.name} must be an image under 5 MB`); const reader = new FileReader(); reader.onload = () => setReferences((current) => [...current, String(reader.result)].slice(0, 4)); reader.readAsDataURL(file) })
  }
  async function generateFinishedFlyer(revise = false) {
    if (!product.title || !blade || !rep) return toast.error("Choose the giveaway, active Titan product, and rep first")
    if (revise && !generatedFlyer) return toast.error("Generate a flyer before requesting edits")
    if (revise && !revisionPrompt.trim()) return toast.error("Describe the changes you want first")
    setImageGenerating(true)
    try {
      const [giveawayImage, productImage, logoImage, styleReference] = await Promise.all([imageDataUrl(product.imageUrl), imageDataUrl(blade.imageUrl), imageDataUrl("/images/brand/logo-system/titan-horizontal-light.png"), imageDataUrl(references[0])])
      const response = await fetch("/api/admin/flyer-studio/artwork", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentFlyer: revise ? generatedFlyer : "", creationPrompt, revisionPrompt: revise ? revisionPrompt : "", giveawayImage, productImage, logoImage, styleReference, headline: copy.headline, subheadline: copy.subheadline, bullets: copy.bullets, cta: copy.cta, price: `$${Number(promo.sellingPrice).toFixed(2)}`, value: `$${financials.customerValue.toFixed(2)} TOTAL VALUE`, savings: `$${financials.customerSavings.toFixed(2)} SAVINGS`, giveawayName: product.title, productName: blade.name, quantity: `${promo.bladeQuantity} INCLUDED`, freeShipping: promo.freeShipping, repName: rep.name, repPhone: rep.phone || "(480) 470-2577", accent: promo.accent }) })
      const data = await responseJson(response); if (!response.ok) throw new Error(data.error || `Flyer generation failed (${response.status})`)
      setGeneratedFlyer(data.imageUrl); if (revise) setRevisionPrompt(""); toast.success(revise ? "Flyer revised from your edit prompt" : "Fresh AI flyer generated from the complete campaign prompt")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Flyer generation failed") } finally { setImageGenerating(false) }
  }
  async function exportFlyer(kind: "sms" | "email") {
    if (generatedFlyer) { const link = document.createElement("a"); link.download = `${campaignName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${kind}.jpg`; link.href = generatedFlyer; link.click(); return }
    const canvas = await createExportCanvas(kind, product, blade, rep, copy, references[0], promo, financials.customerValue, financials.customerSavings); const link = document.createElement("a"); link.download = `${campaignName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${kind}.jpg`; link.href = canvas.toDataURL("image/jpeg", kind === "sms" ? .86 : .92); link.click()
  }
  async function savePromotion() {
    if (!blade || !rep || !product.title) return toast.error("Select a giveaway, blade, and representative first")
    setSaving(true)
    try {
      const smsCanvas = await createExportCanvas("sms", product, blade, rep, copy, references[0], promo, financials.customerValue, financials.customerSavings)
      const emailCanvas = await createExportCanvas("email", product, blade, rep, copy, references[0], promo, financials.customerValue, financials.customerSavings)
      if (generatedFlyer) { const image = await loadImage(generatedFlyer); if (image) { smsCanvas.getContext("2d")!.drawImage(image, 0, 0, smsCanvas.width, smsCanvas.height); emailCanvas.getContext("2d")!.drawImage(image, 0, 0, emailCanvas.width, emailCanvas.height) } }
      const body = { id: promotionId || undefined, name: promo.name, sku: promo.sku, repId, campaignTemplateId: campaignId || null, sourceUrl: product.sourceUrl, giveawayName: product.title, giveawayImageUrl: product.imageUrl, referenceImages: references, marketingCopy: copy, description: copy.body, flyerSmsImage: smsCanvas.toDataURL("image/jpeg", .84), flyerEmailImage: emailCanvas.toDataURL("image/jpeg", .88), costs: { sellingPrice: Number(promo.sellingPrice), bladeLines: [{ quantity: Number(promo.bladeQuantity), unitCost: Number(blade.unitCost || 0), unitRetail: Number(blade.price || 0) }], giveawayCost: Number(promo.giveawayCost), giveawayRetail: Number(promo.giveawayRetail), packagingCost: Number(promo.packagingCost), handlingCost: Number(promo.handlingCost), shippingEstimate: Number(promo.shippingEstimate), freeShipping: promo.freeShipping, paymentFeePercent: Number(promo.paymentFeePercent), tariffCost: Number(promo.tariffCost), vigCost: Number(promo.vigCost), commissionCost: Number(promo.commissionCost), otherCost: Number(promo.otherCost) }, bundleItems: [{ type: "BLADE", productId: blade.id, sku: blade.sku, name: blade.name, quantity: Number(promo.bladeQuantity), unitCost: blade.unitCost || 0, unitRetail: blade.price }, { type: "GIVEAWAY", productId: gift?.id || null, sku: gift?.sku || product.sku, name: product.title, quantity: 1, unitCost: Number(promo.giveawayCost), unitRetail: Number(promo.giveawayRetail), sourceUrl: product.sourceUrl }] }
      const response = await fetch("/api/admin/flyer-studio/promotions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error)
      setPromotionId(data.promotion.id); setPromotions((items) => [data.promotion, ...items.filter((item) => item.id !== data.promotion.id)]); toast.success("Promotion draft and local bundle product saved")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save promotion") } finally { setSaving(false) }
  }
  async function publishPromotion() {
    if (!promotionId) return toast.error("Save the promotion draft before publishing")
    if (!window.confirm("Publish this reviewed promotion item to Zoho Books now?")) return
    setPublishing(true)
    try { const response = await fetch("/api/admin/flyer-studio/promotions/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ promotionId, confirm: true }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setPromotions((items) => items.map((item) => item.id === data.promotion.id ? data.promotion : item)); toast.success("Promotion item published to Zoho Books") } catch (error) { toast.error(error instanceof Error ? error.message : "Zoho publish failed") } finally { setPublishing(false) }
  }
  async function saveCampaign() {
    if (!blade || !rep || !canvasRef.current) return toast.error("Complete the blade and rep selections")
    setSaving(true)
    try { const campaignCanvas = await createExportCanvas(channel === "SMS" ? "sms" : "email", product, blade, rep, copy, references[0], promo, financials.customerValue, financials.customerSavings); const imageUrl = generatedFlyer || campaignCanvas.toDataURL("image/jpeg", channel === "SMS" ? .84 : .9); const content = channel === "EMAIL" ? `${copy.emailSubject}\n${copy.emailPreheader}\n\n${copy.body}\n\n${copy.cta}` : channel === "PHONE" ? `${copy.headline}\n\n${copy.body}\n\n${copy.bullets.join("\n")}` : copy.smsCopy; const res = await fetch("/api/admin/flyer-studio/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: campaignId || null, name: campaignName, channel, content, imageUrl }) }); const data = await res.json(); if (!res.ok) throw new Error(data.error); setCampaignId(data.campaign.id); setCampaigns((current) => [data.campaign, ...current.filter((item) => item.id !== data.campaign.id)]); toast.success("AI flyer saved to campaign") } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save") } finally { setSaving(false); await refreshPreview() }
  }

  if (loading) return <div className="page-content items-center justify-center text-neutral-400"><FiLoader className="animate-spin" size={28} /></div>
  return <div className="page-content flyer-studio">
    <div className="page-header"><div><div className="flex items-center gap-2 text-orange-400 text-xs font-black uppercase tracking-[.22em]"><FiZap /> Creative tools</div><h1 className="page-title mt-1">Contractor Flyer Studio</h1><p className="page-subtitle">Import a contractor product, pair it with a Titan blade, and publish a campaign-ready flyer.</p></div></div>
    <div className="page-body grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(400px,.78fr)] gap-6 overflow-y-auto">
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Step n="1" title="Choose or import the giveaway" icon={<FiLink />} /><label className="block text-xs font-bold text-neutral-400 mt-4">Existing Titan gift<select className="field mt-1" value={giftId} onChange={(e) => selectGift(e.target.value)}><option value="">Use a product link instead</option>{gifts.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}</select></label><div className="flex gap-2 mt-3"><input className="field flex-1" value={product.sourceUrl} onChange={(e) => setProduct({ ...product, sourceUrl: e.target.value })} placeholder="Paste Amazon, Home Depot, or Lowe's product URL" /><button className="btn-primary" onClick={scrape} disabled={scraping}>{scraping ? <FiLoader className="animate-spin" /> : <FiDownload />} Import</button></div><div className="grid sm:grid-cols-2 gap-2 mt-3"><label className="btn-secondary w-full justify-center cursor-pointer">{extractingScreenshot ? <FiLoader className="animate-spin" /> : <FiUpload />} {extractingScreenshot ? "Reading screenshot..." : "Upload screenshot"}<input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" disabled={extractingScreenshot} onChange={(e) => { importProductScreenshot(e.target.files); e.target.value = "" }} /></label><div tabIndex={0} className="min-h-11 rounded-xl border border-dashed border-orange-500/40 bg-orange-500/[.06] px-4 py-2 text-xs font-bold text-orange-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-orange-500/50"><FiClipboard /> Print Screen, then Ctrl+V anywhere</div></div><p className="text-[11px] text-neutral-500 mt-2">Capture a product page with Print Screen and press Ctrl+V anywhere in the studio. The screenshot becomes the giveaway image and AI fills the visible title, price, description, and specifications. JPG, PNG, and WebP uploads also work.</p>
          <div className="grid sm:grid-cols-2 gap-3 mt-4"><Field label="Product title" value={product.title} set={(title) => setProduct({ ...product, title })} /><Field label="Brand" value={product.brand} set={(brand) => setProduct({ ...product, brand })} /><Field label="Model / SKU" value={product.model || product.sku} set={(model) => setProduct({ ...product, model })} /><Field label="Price" value={product.price} set={(price) => setProduct({ ...product, price })} /><Field label="Product image URL" value={product.imageUrl} set={(imageUrl) => setProduct({ ...product, imageUrl })} wide /><label className="sm:col-span-2 text-xs font-bold text-neutral-400">Description<textarea className="field mt-1 min-h-24" value={product.description} onChange={(e) => setProduct({ ...product, description: e.target.value })} /></label><label className="sm:col-span-2 text-xs font-bold text-neutral-400">Features / specifications (one per line)<textarea className="field mt-1 min-h-24" value={product.features.join("\n")} onChange={(e) => setProduct({ ...product, features: e.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })} /></label></div>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Step n="2" title="Search active Titan products" icon={<FiSearch />} /><p className="text-[11px] text-neutral-500 mt-3">Search all active products by name, SKU, size, application, manufacturer, or vendor. No category selection is required.</p><input className="field mt-3" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all active products..." /><div className="grid sm:grid-cols-2 gap-2 mt-3 max-h-72 overflow-y-auto pr-1">{filteredProducts.map((item) => <button key={item.id} onClick={() => setBladeId(item.id)} className={`text-left p-3 rounded-xl border transition ${bladeId === item.id ? "border-orange-500 bg-orange-500/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}><div className="text-sm font-bold text-white">{item.name}</div><div className="text-[11px] text-neutral-500 mt-1">{item.sku}{item.size ? ` • ${item.size}` : ""} • ${item.price.toFixed(2)}</div></button>)}{filteredProducts.length === 0 && <div className="sm:col-span-2 p-6 text-center text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl">No active products match this search.</div>}</div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Step n="3" title="Rep and style references" icon={<FiUpload />} /><div className="grid sm:grid-cols-2 gap-3 mt-4"><label className="text-xs font-bold text-neutral-400">Sales representative<select className="field mt-1" value={repId} onChange={(e) => setRepId(e.target.value)}><option value="">Select rep</option>{reps.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs font-bold text-neutral-400">Reference flyers<input className="field mt-1 file:text-orange-400" type="file" accept="image/*" multiple onChange={(e) => uploadReferences(e.target.files)} /></label></div>{(references.length > 0 || savedReferences.length > 0) && <div className="flex gap-2 mt-3 overflow-x-auto">{references.map((url, index) => <button key={url.slice(-20)} title="Remove reference" onClick={() => setReferences((current) => current.filter((_, i) => i !== index))}><NextImage unoptimized width={64} height={80} src={url} alt={`Reference ${index + 1}`} className="h-20 w-16 rounded-lg object-cover border border-orange-500/40" /></button>)}{savedReferences.slice(0, 6).map((asset) => <button key={asset.id} onClick={() => setReferences([asset.url])}><NextImage unoptimized width={64} height={80} src={asset.url} alt={asset.title} className="h-20 w-16 rounded-lg object-cover border border-white/10 opacity-70 hover:opacity-100" /></button>)}</div>}</section>
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="flex items-center justify-between gap-3"><Step n="4" title="Flyer and SMS marketing copy" icon={<FiZap />} /><button className="btn-primary" onClick={generateCopy} disabled={generating}>{generating ? <FiLoader className="animate-spin" /> : <FiZap />} Recreate from selected data</button></div><p className="text-[11px] text-neutral-500 mt-3">The generator emulates the short, urgent contractor language from your current flyers. Every displayed text element remains editable and is saved with the promotion.</p><div className="grid sm:grid-cols-2 gap-3 mt-4"><Field label="Large offer headline" value={copy.headline} set={(headline) => setCopy({ ...copy, headline })} /><Field label="Package subheadline" value={copy.subheadline} set={(subheadline) => setCopy({ ...copy, subheadline })} /><Field label="Call-to-action banner" value={copy.cta} set={(cta) => setCopy({ ...copy, cta })} /><Field label="SMS message copy" value={copy.smsCopy} set={(smsCopy) => setCopy({ ...copy, smsCopy })} /><label className="sm:col-span-2 text-xs font-bold text-neutral-400">Offer body<textarea className="field mt-1 min-h-24" value={copy.body} onChange={(e) => setCopy({ ...copy, body: e.target.value })} /></label>{copy.bullets.map((bullet, index) => <Field key={index} label={`Flyer benefit ${index + 1}`} value={bullet} set={(value) => setCopy({ ...copy, bullets: copy.bullets.map((item, i) => i === index ? value : item) })} />)}</div></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Step n="5" title="Email copy" icon={<FiImage />} /><div className="grid sm:grid-cols-2 gap-3 mt-4"><Field label="Email subject" value={copy.emailSubject} set={(emailSubject) => setCopy({ ...copy, emailSubject })} /><Field label="Email preheader" value={copy.emailPreheader} set={(emailPreheader) => setCopy({ ...copy, emailPreheader })} /></div><p className="text-[11px] text-neutral-500 mt-3">The email uses the offer body, benefit bullets, CTA, assigned rep details, and the generated email flyer image.</p></section>
        <section className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><Step n="6" title="Build the promotion and verify profit" icon={<FiPackage />} /><div className="grid sm:grid-cols-3 gap-3 mt-4"><Field label="Promotion name" value={promo.name} set={(name) => setPromo({ ...promo, name })} /><Field label="Promo SKU" value={promo.sku} set={(sku) => setPromo({ ...promo, sku })} /><NumberField label="Selling price" value={promo.sellingPrice} set={(sellingPrice) => setPromo({ ...promo, sellingPrice })} /><NumberField label="Blade quantity" value={promo.bladeQuantity} set={(bladeQuantity) => setPromo({ ...promo, bladeQuantity })} /><NumberField label="Giveaway cost" value={promo.giveawayCost} set={(giveawayCost) => setPromo({ ...promo, giveawayCost })} /><NumberField label="Giveaway retail value" value={promo.giveawayRetail} set={(giveawayRetail) => setPromo({ ...promo, giveawayRetail })} /><NumberField label="Packaging" value={promo.packagingCost} set={(packagingCost) => setPromo({ ...promo, packagingCost })} /><NumberField label="Handling" value={promo.handlingCost} set={(handlingCost) => setPromo({ ...promo, handlingCost })} /><NumberField label="Estimated shipping" value={promo.shippingEstimate} set={(shippingEstimate) => setPromo({ ...promo, shippingEstimate })} /><NumberField label="Payment fee %" value={promo.paymentFeePercent} set={(paymentFeePercent) => setPromo({ ...promo, paymentFeePercent })} /><label className="text-xs font-bold text-neutral-400">Flyer accent<input type="color" className="field mt-1 h-11" value={promo.accent} onChange={(e) => setPromo({ ...promo, accent: e.target.value })} /></label><label className="flex items-center gap-2 text-sm text-white mt-6"><input type="checkbox" checked={promo.freeShipping} onChange={(e) => setPromo({ ...promo, freeShipping: e.target.checked })} /> Free shipping included</label></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5"><Metric label="Blade cost" value={financials.bladeCost} /><Metric label="Gift cost" value={financials.giveawayCost} /><Metric label="Shipping" value={financials.shippingCost} /><Metric label="Total cost" value={financials.totalCost} /><Metric label="Gross profit" value={financials.grossProfit} good={financials.grossProfit >= 0} /><Metric label="Gross margin" value={financials.grossMarginPercent} suffix="%" good={financials.grossMarginPercent >= 30} /><Metric label="Customer value" value={financials.customerValue} /><Metric label="Customer savings" value={financials.customerSavings} /></div><p className="text-[11px] text-neutral-500 mt-3">The public flyer displays value and savings only. Internal costs and profit stay in this admin view.</p></section>
        <section className="rounded-2xl border border-orange-500/30 bg-orange-500/[.06] p-5">
          <div className="flex items-center justify-between gap-4"><div><h2 className="font-bold text-white">Generate the finished flyer</h2><p className="text-[11px] text-neutral-400 mt-1">Creates a completely fresh AI-designed flyer from every selected product, image, offer detail, copy field, cost-derived value, and rep detail. It does not fill a preset box layout.</p></div><button className="btn-primary shrink-0" onClick={() => generateFinishedFlyer(false)} disabled={imageGenerating}>{imageGenerating ? <FiLoader className="animate-spin" /> : <FiZap />} {generatedFlyer ? "Regenerate flyer" : "Generate fresh flyer"}</button></div>
          <label className="block text-xs font-bold text-neutral-300 mt-4">Creative direction for the flyer<textarea className="field mt-1 min-h-28" value={creationPrompt} onChange={(event) => setCreationPrompt(event.target.value)} placeholder="Example: Make the blade dominant, use a dramatic concrete-cutting jobsite at dawn, keep sparks controlled, and create a bold premium contractor-ad composition." /></label>
          <p className="text-[10px] text-neutral-500 mt-2">Describe composition, mood, setting, lighting, product emphasis, or intensity. This guides the first render but cannot override the selected products, offer facts, official logo, pricing, or contact details.</p>
          {generatedFlyer && <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4"><div className="text-xs text-emerald-400 flex items-center gap-2"><FiCheck /> AI flyer generated and ready for review.</div><label className="block text-xs font-bold text-neutral-300 mt-3">Prompt edits to this flyer<textarea className="field mt-1 min-h-24" value={revisionPrompt} onChange={(event) => setRevisionPrompt(event.target.value)} placeholder="Example: Make the blade larger, reduce the sparks, move the price higher, and keep every word and product exactly the same." /></label><button className="btn-primary mt-3 w-full justify-center" onClick={() => generateFinishedFlyer(true)} disabled={imageGenerating || !revisionPrompt.trim()}>{imageGenerating ? <FiLoader className="animate-spin" /> : <FiEdit3 />} Apply AI edits to current flyer</button><p className="text-[10px] text-neutral-500 mt-2">The current flyer is used as the edit source. Product names, price, offer facts, rep information, and CTA remain locked unless your prompt explicitly changes a supplied editable field.</p></div>}
        </section>
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/[.035] p-5">
          <h2 className="font-bold text-white">Additional promotion costs</h2>
          <p className="text-[11px] text-neutral-500 mt-1">These are included in total cost and deducted from the package price before profit is shown.</p>
          <div className="grid sm:grid-cols-4 gap-3 mt-4">
            <NumberField label="VIG cost" value={promo.vigCost} set={(vigCost) => setPromo({ ...promo, vigCost })} />
            <NumberField label="Rep commission" value={promo.commissionCost} set={(commissionCost) => setPromo({ ...promo, commissionCost })} />
            <NumberField label="Other promo overhead" value={promo.otherCost} set={(otherCost) => setPromo({ ...promo, otherCost })} />
          </div>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4 text-sm">
            <div className="text-neutral-400">Package price − blade cost − gift cost − VIG − commission − packaging − handling − shipping − payment fee − other costs</div>
            <div className={`text-xl font-black mt-2 ${financials.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>${Number(promo.sellingPrice || 0).toFixed(2)} − ${financials.totalCost.toFixed(2)} = ${financials.grossProfit.toFixed(2)} profit</div>
          </div>
        </section>
      </div>
      <aside className="space-y-4 xl:sticky xl:top-0 self-start"><div className="rounded-2xl border border-white/10 bg-[#161616] p-4"><div className="flex items-center justify-between mb-3"><div><div className="font-bold text-white">Generated image preview</div><div className="text-[11px] text-neutral-500">SMS 1080×1350 • Email 1200×1500</div></div>{rendered && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><FiCheck /> Generated</span>}</div><div className="grid grid-cols-2 gap-2 mb-3"><button className={previewKind === "sms" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setPreviewKind("sms")}>SMS image</button><button className={previewKind === "email" ? "btn-primary justify-center" : "btn-secondary justify-center"} onClick={() => setPreviewKind("email")}>Email image</button></div><canvas ref={canvasRef} role="img" aria-label={`Generated Titan Diamond ${previewKind} flyer preview`} className="w-full h-auto bg-black rounded-xl shadow-2xl" /></div>
        <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><div className="text-sm font-bold text-white mb-3">Export & campaign</div><div className="grid grid-cols-2 gap-2"><button className="btn-secondary" onClick={() => exportFlyer("sms")}><FiImage /> SMS image</button><button className="btn-secondary" onClick={() => exportFlyer("email")}><FiDownload /> Email image</button></div><div className="space-y-3 mt-4"><label className="text-xs font-bold text-neutral-400">Save into campaign<select className="field mt-1" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); const selected = campaigns.find((item) => item.id === e.target.value); if (selected) { setCampaignName(selected.name); const legacyChannel = selected.channel.toUpperCase(); setChannel(legacyChannel === "VOICE" ? "PHONE" : legacyChannel) } }}><option value="">Create a new campaign</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.channel})</option>)}</select></label><Field label="Campaign name" value={campaignName} set={setCampaignName} /><label className="text-xs font-bold text-neutral-400">Channel<select className="field mt-1" value={channel} onChange={(e) => setChannel(e.target.value)}>{campaignTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label><button className="btn-primary w-full justify-center" onClick={saveCampaign} disabled={saving}>{saving ? <FiLoader className="animate-spin" /> : <FiSave />} {campaignId ? "Update campaign" : "Save new campaign"}</button><div className="border-t border-white/10 pt-3"><label className="text-xs font-bold text-neutral-400">Promotion draft<select className="field mt-1" value={promotionId} onChange={(e) => setPromotionId(e.target.value)}><option value="">New promotion</option>{promotions.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.status}</option>)}</select></label><button className="btn-secondary w-full justify-center mt-3" onClick={savePromotion} disabled={saving}>{saving ? <FiLoader className="animate-spin" /> : <FiPackage />} Save draft + local bundle product</button><button className="btn-primary w-full justify-center mt-2" onClick={publishPromotion} disabled={publishing || !promotionId}>{publishing ? <FiLoader className="animate-spin" /> : <FiCloud />} Publish reviewed item to Zoho Books</button><p className="text-[10px] text-neutral-500 mt-2">Zoho publishing is explicit. Fulfillment packages are created later from an actual sales order.</p></div></div></div>
      </aside>
    </div>
  </div>
}

function Step({ n, title, icon }: { n: string; title: string; icon: React.ReactNode }) { return <div className="flex items-center gap-3"><div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 text-orange-400 flex items-center justify-center">{icon}</div><div><div className="text-[10px] font-black uppercase tracking-[.2em] text-neutral-600">Step {n}</div><h2 className="font-bold text-white">{title}</h2></div></div> }
function Field({ label, value, set, wide = false }: { label: string; value: string; set: (value: string) => void; wide?: boolean }) { return <label className={`${wide ? "sm:col-span-2" : ""} text-xs font-bold text-neutral-400`}>{label}<input className="field mt-1" value={value || ""} onChange={(e) => set(e.target.value)} /></label> }
function NumberField({ label, value, set }: { label: string; value: string; set: (value: string) => void }) { return <label className="text-xs font-bold text-neutral-400">{label}<input className="field mt-1" type="number" min="0" step="0.01" value={value} onChange={(e) => set(e.target.value)} /></label> }
function Metric({ label, value, suffix = "", good }: { label: string; value: number; suffix?: string; good?: boolean }) { return <div className="rounded-xl bg-black/30 border border-white/10 p-3"><div className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</div><div className={`font-black mt-1 ${good === undefined ? "text-white" : good ? "text-emerald-400" : "text-red-400"}`}>{suffix ? `${value.toFixed(1)}${suffix}` : `$${value.toFixed(2)}`}</div></div> }
