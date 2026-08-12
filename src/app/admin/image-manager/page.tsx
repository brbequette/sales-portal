"use client"

import React, { useEffect, useState, useRef } from "react"
import {
  FiImage, FiUploadCloud, FiCpu, FiCheck, FiX, FiRefreshCw, FiLoader,
  FiEdit, FiZap, FiPlus, FiArrowRight, FiFileText, FiTag, FiSearch, FiSliders, FiSun, FiRotateCw, FiAlertTriangle
} from "react-icons/fi"

interface Match {
  id: string
  sku: string
  name: string
  price: number
  category: string
}

interface ImageFile {
  fileName: string
  stem: string
  cleanedStem: string
  isProcessed: boolean
  hasDetailA: boolean
  hasDetailB: boolean
  hasDetailC: boolean
  hasDetailD: boolean
  isStaged: boolean
  stagedUrl: string | null
  matches: Match[]
}

export default function ImageManagerPage() {
  const [files, setFiles] = useState<ImageFile[]>([])
  const [loading, setLoading] = useState(false)
  
  // Tabs: 'all' | 'unmatched' | 'conflicts' | 'needs-images' | 'products'
  const [activeTab, setActiveTab] = useState<'all' | 'unmatched' | 'conflicts' | 'needs-images' | 'products'>('all')
  const [selectedFile, setSelectedFile] = useState<ImageFile | null>(null)
  
  // Stored state lists
  const [needsImages, setNeedsImages] = useState<Match[]>([])
  const [allProducts, setAllProducts] = useState<Match[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [conflicts, setConflicts] = useState<{ cleanedStem: string, files: ImageFile[] }[]>([])
  const [storage, setStorage] = useState<any>(null)
  const [searchProductQuery, setSearchProductQuery] = useState("")
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  
  // Selected conflict group: [cleanedStem, filesInGroup]
  const [selectedConflictGroup, setSelectedConflictGroup] = useState<[string, ImageFile[]] | null>(null)
  
  // Conflict assignment mapping: fileName -> 'primary' | 'detail_a' | 'detail_b' | 'discard'
  const [conflictMappings, setConflictMappings] = useState<Record<string, 'primary' | 'detail_a' | 'detail_b' | 'discard'>>({})

  // Carousel State
  const [carouselIndex, setCarouselIndex] = useState(0) // 0: raw, 1: processed, 2: detail_a, 3: detail_b
  
  // Editing State
  const [brightness, setBrightness] = useState(1.0)
  const [contrast, setContrast] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  
  // Custom Badge overrides
  const [badgeSize, setBadgeSize] = useState("")
  const [badgeSegHeight, setBadgeSegHeight] = useState("")
  const [badgeBond, setBadgeBond] = useState("")
  const [badgeType, setBadgeType] = useState("")
  
  // Enhancement controls
  const [sharpness, setSharpness] = useState(1.0)
  const [saturation, setSaturation] = useState(1.0)
  const [autoLevels, setAutoLevels] = useState(false)
  const [denoise, setDenoise] = useState(false)
  const [bgRemovalLoading, setBgRemovalLoading] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  
  // Matching and uploading state
  const [manualSku, setManualSku] = useState("")
  const [editingSku, setEditingSku] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [batchSelecting, setBatchSelecting] = useState(false)
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([])
  
  // Catalog extraction state
  const [catalogProgress, setCatalogProgress] = useState("")

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [limit] = useState(32)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [counts, setCounts] = useState({ all: 0, unmatched: 0, products: 0, needsImages: 0, conflicts: 0 })
  const [fileSearch, setFileSearch] = useState("")
  const [fileSearchQuery, setFileSearchQuery] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const catalogInputRef = useRef<HTMLInputElement>(null)

  // Fetch images listing
  const fetchFiles = async () => {
    setLoading(true)
    try {
      const url = `/api/admin/images?page=${currentPage}&limit=${limit}&tab=${activeTab}&search=${encodeURIComponent(fileSearchQuery)}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setFiles(data.files || [])
        setNeedsImages(data.needsImages || [])
        setProducts(data.products || [])
        setConflicts(data.conflicts || [])
        setAllProducts(data.allProducts || [])
        setStorage(data.storage || null)
        if (data.counts) {
          setCounts(data.counts)
        }
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1)
          setTotalItems(data.pagination.totalItems || 0)
        }
        
        // Auto pre-focus if query parameter sku exists
        const urlParams = new URLSearchParams(window.location.search)
        const skuParam = urlParams.get("sku")
        if (skuParam) {
          const matchingFile = (data.files || []).find((f: ImageFile) => 
            f.matches.some(m => m.sku.toUpperCase() === skuParam.toUpperCase()) ||
            f.cleanedStem === skuParam.toUpperCase()
          )
          if (matchingFile) {
            setSelectedFile(matchingFile)
          } else {
            const dbProduct = (data.allProducts || []).find((p: Match) => p.sku.toUpperCase() === skuParam.toUpperCase())
            if (dbProduct) {
              setSelectedFile({
                fileName: `NEW_${dbProduct.sku}.png`,
                stem: dbProduct.sku,
                cleanedStem: dbProduct.sku,
                isProcessed: false,
                hasDetailA: false,
                hasDetailB: false,
                hasDetailC: false,
                hasDetailD: false,
                isStaged: false,
                stagedUrl: null,
                matches: [dbProduct]
              })
            }
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Debounce search query so we don't spam the API on every keypress
  useEffect(() => {
    const timer = setTimeout(() => {
      setFileSearchQuery(fileSearch)
      setCurrentPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [fileSearch])

  // Trigger load when page/tab/search changes
  useEffect(() => {
    fetchFiles()
  }, [currentPage, activeTab, fileSearchQuery])

  // Reset slider settings when file changes
  useEffect(() => {
    if (selectedFile) {
      setBrightness(1.0)
      setContrast(1.0)
      setRotation(0)
      setBadgeSize("")
      setBadgeSegHeight("")
      setBadgeBond("")
      setBadgeType("")
      setSharpness(1.0)
      setSaturation(1.0)
      setAutoLevels(false)
      setDenoise(false)
      setLastSaved(null)
      setManualSku("")
      setCarouselIndex(selectedFile.isProcessed ? 1 : 0)
      setSelectedConflictGroup(null)
    }
  }, [selectedFile])

  // Reset conflict mappings when selected group changes
  useEffect(() => {
    if (selectedConflictGroup) {
      setSelectedFile(null)
      const initialMap: Record<string, 'primary' | 'detail_a' | 'detail_b' | 'discard'> = {}
      selectedConflictGroup[1].forEach((file, index) => {
        if (index === 0) initialMap[file.fileName] = 'primary'
        else if (index === 1) initialMap[file.fileName] = 'detail_a'
        else if (index === 2) initialMap[file.fileName] = 'detail_b'
        else initialMap[file.fileName] = 'discard'
      })
      setConflictMappings(initialMap)
    }
  }, [selectedConflictGroup])

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    setCurrentPage(1)
    setSelectedConflictGroup(null)
    setSelectedFile(null)
  }

  const filteredFiles = files

  // Handles upload of a regular image file
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0]
    if (!uploaded) return
    
    setLoading(true)
    const formData = new FormData()
    formData.append("file", uploaded)

    try {
      const res = await fetch("/api/admin/images/upload", {
        method: "POST",
        body: formData
      })
      const data = await res.json()
      if (data.success) {
        alert("Image uploaded successfully!")
        await fetchFiles()
      } else {
        alert("Upload failed: " + data.error)
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Handles catalog file upload + extraction trigger
  const handleCatalogExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = e.target.files?.[0]
    if (!uploaded) return
    
    setCatalogProgress("Uploading catalog...")
    const formData = new FormData()
    formData.append("file", uploaded)

    try {
      const uploadRes = await fetch("/api/admin/images/upload", {
        method: "POST",
        body: formData
      })
      const uploadData = await uploadRes.json()
      if (!uploadData.success) {
        throw new Error(uploadData.error)
      }

      setCatalogProgress("Extracting images & text from catalog...")
      const extractRes = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "extract-catalog",
          fileName: uploadData.fileName
        })
      })
      const extractData = await extractRes.json()
      if (extractData.success) {
        alert(`Successfully extracted and matched ${extractData.extracted?.length || 0} images!`)
        await fetchFiles()
      } else {
        alert("Extraction failed: " + extractData.error)
      }
    } catch (err: any) {
      alert("Error during extraction: " + err.message)
    } finally {
      setCatalogProgress("")
      if (catalogInputRef.current) catalogInputRef.current.value = ""
    }
  }

  const handleProcess = async (file: ImageFile) => {
    setActionLoading("process")
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "process",
          fileName: file.fileName
        })
      })
      const data = await res.json()
      if (data.success) {
        await fetchFiles()
        setCarouselIndex(1) // Show processed
      } else {
        alert("Processing failed: " + data.error)
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleApplyEdits = async () => {
    if (!selectedFile) return
    setActionLoading("edit")
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit",
          fileName: selectedFile.fileName,
          brightness,
          contrast,
          rotation,
          sharpness,
          saturation,
          autoLevels,
          denoise,
          badges: {
            size: badgeSize || undefined,
            seg_height: badgeSegHeight || undefined,
            bond: badgeBond || undefined,
            type: badgeType || undefined
          }
        })
      })
      const data = await res.json()
      if (data.success) {
        await fetchFiles()
        setCarouselIndex(1)
        setLastSaved(new Date().toLocaleTimeString())
        alert("Edits applied and re-processed successfully!")
      } else {
        alert("Edits failed: " + data.error)
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handlePublish = async (file: ImageFile, sku: string) => {
    setActionLoading("stage")
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "stage",
          fileName: file.fileName,
          sku: sku
        })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Successfully published ${file.fileName} to SKU ${sku}! ${data.zohoUploaded ? "Uploaded to Zoho Books." : "Local fallback mapped."}`)
        await fetchFiles()
      } else {
        alert("Publish failed: " + data.error)
      }
    } catch (err: any) {
      alert("Error: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  // Handle conflict resolution submit
  const handleResolveConflict = async () => {
    if (!selectedConflictGroup) return
    setActionLoading("resolve-conflict")
    
    const sku = selectedConflictGroup[0]
    const primaryFile = Object.entries(conflictMappings).find(([_, type]) => type === 'primary')?.[0]
    const detailAFile = Object.entries(conflictMappings).find(([_, type]) => type === 'detail_a')?.[0]
    const detailBFile = Object.entries(conflictMappings).find(([_, type]) => type === 'detail_b')?.[0]
    const discardFiles = Object.entries(conflictMappings).filter(([_, type]) => type === 'discard').map(([f]) => f)

    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve-conflict",
          sku,
          primaryFile,
          detailAFile,
          detailBFile,
          discardFiles
        })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Duplicate conflict resolved successfully for ${sku}!`)
        setSelectedConflictGroup(null)
        await fetchFiles()
      } else {
        alert("Failed to resolve conflict: " + data.error)
      }
    } catch (err: any) {
      alert("Error resolving conflict: " + err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleClearArchive = async () => {
    if (!confirm("Are you sure you want to clear all files in the archive folder? This cannot be undone.")) return
    setLoading(true)
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-archive" })
      })
      const data = await res.json()
      if (data.success) {
        alert("Archive cleared successfully!")
        await fetchFiles()
      } else {
        alert("Failed to clear archive: " + data.error)
      }
    } catch (e: any) {
      alert("Error: " + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveBg = async (bgReplace: string = 'white') => {
    if (!selectedFile) return
    setBgRemovalLoading(true)
    try {
      const res = await fetch('/api/admin/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove-bg',
          fileName: selectedFile.fileName,
          bgReplace
        })
      })
      const data = await res.json()
      if (data.success) {
        setLastSaved(new Date().toLocaleTimeString())
        await fetchFiles()
        setCarouselIndex(1)
      } else {
        alert('Background removal failed: ' + data.error)
      }
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setBgRemovalLoading(false)
    }
  }

  const handleBatchAction = async (action: "process" | "stage") => {
    if (selectedFileNames.length === 0) return
    setLoading(true)
    try {
      let count = 0
      for (const fileName of selectedFileNames) {
        const file = files.find(f => f.fileName === fileName)
        if (!file) continue
        
        if (action === "process") {
          await fetch("/api/admin/images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "process", fileName })
          })
          count++
        } else if (action === "stage") {
          const matchSku = file.matches?.[0]?.sku || file.cleanedStem
          if (matchSku) {
            await fetch("/api/admin/images", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "stage", fileName, sku: matchSku })
            })
            count++
          }
        }
      }
      alert(`Batch ${action} completed for ${count} files!`)
      setSelectedFileNames([])
      setBatchSelecting(false)
      await fetchFiles()
    } catch (err: any) {
      alert("Error during batch operation: " + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleSelectAll = () => {
    if (selectedFileNames.length === files.length) {
      setSelectedFileNames([])
    } else {
      setSelectedFileNames(files.map(f => f.fileName))
    }
  }

  const handleToggleSelect = (fileName: string) => {
    if (selectedFileNames.includes(fileName)) {
      setSelectedFileNames(selectedFileNames.filter(name => name !== fileName))
    } else {
      setSelectedFileNames([...selectedFileNames, fileName])
    }
  }

  const getImageUrl = (file: ImageFile, type: "raw" | "processed" | "detail_a" | "detail_b" | "detail_c" | "detail_d") => {
    return `/api/admin/images/serve?file=${encodeURIComponent(file.fileName)}&type=${type}`
  }

  return (
    <div className="page-content bg-neutral-950 min-h-screen text-white p-6">
      {/* ─── Header ─────────────────────────────────── */}
      <div className="page-header flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-xl shadow-lg">
            🖼️
          </div>
          <div>
            <h1 className="page-title text-2xl font-black tracking-wider text-white">Product Image Manager</h1>
            <p className="page-subtitle text-xs text-neutral-400">Match product pictures, extract catalogs, standardise crops and stage to Zoho & local database.</p>
          </div>
        </div>

        {/* ─── Actions panel ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Smart Catalog Extractor */}
          <div className="relative">
            <input
              type="file"
              ref={catalogInputRef}
              onChange={handleCatalogExtract}
              accept=".pdf,.xlsx"
              className="hidden"
            />
            <button
              onClick={() => catalogInputRef.current?.click()}
              disabled={!!catalogProgress}
              className="td-btn bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-xs px-4 py-2 rounded-lg flex items-center gap-2 transition-all"
            >
              {catalogProgress ? (
                <>
                  <FiLoader className="animate-spin" />
                  <span>{catalogProgress}</span>
                </>
              ) : (
                <>
                  <FiFileText />
                  <span>Extract Catalog (PDF/XLSX)</span>
                </>
              )}
            </button>
          </div>

          {/* Upload Dropzone */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="td-btn bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/10"
            >
              <FiUploadCloud />
              <span>Upload New Pic</span>
            </button>
          </div>

          <button
            onClick={fetchFiles}
            className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} />
          </button>
        </div>
      </div>

      {/* ─── Body Layout ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Files List (4cols) */}
        <div className="lg:col-span-4 glass-panel border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[750px] shadow-2xl">
          <div className="p-4 border-b border-white/10 bg-neutral-900/60 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-200">Catalog Directory</h2>
            <button
              onClick={() => {
                setBatchSelecting(!batchSelecting)
                setSelectedFileNames([])
              }}
              className={`text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded transition-colors ${
                batchSelecting ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {batchSelecting ? "Cancel" : "Select Batch"}
            </button>
          </div>

          {/* Global DB Search bar inside sidebar */}
          <div className="p-3 border-b border-white/5 bg-neutral-900/10 relative">
            <div className="relative">
              <input
                type="text"
                placeholder="Search catalog or DB SKUs..."
                value={searchProductQuery}
                onChange={e => {
                  setSearchProductQuery(e.target.value)
                  setShowProductDropdown(e.target.value.length > 0)
                }}
                className="w-full bg-black/45 border border-white/10 rounded-lg px-8 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
              <FiSearch className="absolute left-2.5 top-2.5 text-neutral-500" size={12} />
              {searchProductQuery && (
                <button
                  onClick={() => { setSearchProductQuery(""); setShowProductDropdown(false); }}
                  className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-white"
                >
                  <FiX size={12} />
                </button>
              )}
            </div>

            {/* Autocomplete selector */}
            {showProductDropdown && (
              <div className="absolute left-3 right-3 mt-1.5 bg-neutral-900 border border-white/15 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-50 divide-y divide-white/5 scrollbar-none">
                {allProducts
                  .filter(p => p.sku.toLowerCase().includes(searchProductQuery.toLowerCase()) || p.name.toLowerCase().includes(searchProductQuery.toLowerCase()))
                  .slice(0, 10)
                  .map(p => (
                    <div
                      key={p.id}
                      onClick={() => {
                        const existing = files.find(f => f.matches.some(m => m.sku === p.sku) || f.cleanedStem === p.sku)
                        if (existing) {
                          setSelectedFile(existing)
                        } else {
                          setSelectedFile({
                            fileName: `NEW_${p.sku}.png`,
                            stem: p.sku,
                            cleanedStem: p.sku,
                            isProcessed: false,
                            hasDetailA: false,
                            hasDetailB: false,
                            hasDetailC: false,
                            hasDetailD: false,
                            isStaged: false,
                            stagedUrl: null,
                            matches: [p]
                          })
                        }
                        setSearchProductQuery("")
                        setShowProductDropdown(false)
                      }}
                      className="p-2.5 hover:bg-emerald-500/10 cursor-pointer text-left transition-colors"
                    >
                      <div className="text-xs font-bold text-emerald-400 font-mono">{p.sku}</div>
                      <div className="text-[10px] text-neutral-300 truncate mt-0.5">{p.name}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Directory Filter Input */}
          <div className="p-3 border-b border-white/5 bg-neutral-900/10">
            <div className="relative">
              <input
                type="text"
                placeholder="Filter files or SKUs by text..."
                value={fileSearch}
                onChange={e => setFileSearch(e.target.value)}
                className="w-full bg-black/45 border border-white/10 rounded-lg px-8 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
              />
              <FiSearch className="absolute left-2.5 top-2.5 text-neutral-500" size={12} />
              {fileSearch && (
                <button
                  onClick={() => setFileSearch("")}
                  className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-white"
                >
                  <FiX size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Directory Tabs */}
          <div className="grid grid-cols-5 border-b border-white/5 bg-neutral-900/20 text-[8px] font-bold uppercase tracking-wider font-mono">
            <button
              onClick={() => handleTabChange('all')}
              className={`py-2 text-center border-b-2 ${activeTab === 'all' ? 'border-emerald-500 text-white bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              All ({counts.all})
            </button>
            <button
              onClick={() => handleTabChange('unmatched')}
              className={`py-2 text-center border-b-2 ${activeTab === 'unmatched' ? 'border-emerald-500 text-white bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              No SKU ({counts.unmatched})
            </button>
            <button
              onClick={() => handleTabChange('products')}
              className={`py-2 text-center border-b-2 ${activeTab === 'products' ? 'border-emerald-500 text-white bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
              title="Products with Images"
            >
              Products with Images ({counts.products})
            </button>
            <button
              onClick={() => handleTabChange('needs-images')}
              className={`py-2 text-center border-b-2 ${activeTab === 'needs-images' ? 'border-emerald-500 text-white bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              No Img ({counts.needsImages})
            </button>
            <button
              onClick={() => handleTabChange('conflicts')}
              className={`py-2 text-center border-b-2 ${activeTab === 'conflicts' ? 'border-emerald-500 text-white bg-white/5' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
            >
              Dupes ({counts.conflicts})
            </button>
          </div>

          {batchSelecting && (
            <div className="px-4 py-2 border-b border-white/10 bg-amber-950/20 text-xs flex items-center justify-between">
              <span className="text-amber-400 font-semibold">{selectedFileNames.length} selected</span>
              <div className="flex gap-2">
                <button onClick={handleToggleSelectAll} className="text-neutral-400 hover:text-white">Select All</button>
                <span className="text-neutral-600">|</span>
                <button onClick={() => setSelectedFileNames([])} className="text-neutral-400 hover:text-white">Clear</button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-900 scrollbar-none">
            {activeTab === 'conflicts' ? (
              // Conflicts View
              conflicts.map(group => {
                const sku = group.cleanedStem
                const groupFiles = group.files
                const isSelected = selectedConflictGroup?.[0] === sku
                return (
                  <div
                    key={sku}
                    onClick={() => setSelectedConflictGroup([sku, groupFiles])}
                    className={`p-4 flex items-center justify-between cursor-pointer transition-all ${
                      isSelected ? "bg-amber-500/10 border-l-4 border-amber-500" : "hover:bg-white/5"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5 font-mono">
                        <FiAlertTriangle /> {sku}
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-1">
                        {groupFiles.length} files match this stem
                      </div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 bg-neutral-850 border border-white/10 text-neutral-300 rounded font-mono font-bold">
                      Resolve
                    </span>
                  </div>
                )
              })
            ) : activeTab === 'needs-images' ? (
              // Needs Images listing
              needsImages.map(p => {
                const isSelected = selectedFile?.stem === p.sku
                return (
                  <div
                    key={p.sku}
                    onClick={() => setSelectedFile({
                      fileName: `NEW_${p.sku}.png`,
                      stem: p.sku,
                      cleanedStem: p.sku,
                      isProcessed: false,
                      hasDetailA: false,
                      hasDetailB: false,
                      hasDetailC: false,
                      hasDetailD: false,
                      isStaged: false,
                      stagedUrl: null,
                      matches: [p]
                    })}
                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? "bg-emerald-500/10 border-l-4 border-emerald-500" : "hover:bg-white/5"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-red-400 font-mono">{p.sku}</div>
                      <div className="text-[10px] text-neutral-300 mt-1 truncate max-w-[200px]">{p.name}</div>
                    </div>
                    <FiPlus className="text-neutral-500" size={14} />
                  </div>
                )
              })
            ) : activeTab === 'products' ? (
              // All Products listing (Catalog)
              products.map(p => {
                const isSelected = selectedFile?.stem === p.sku
                const hasImage = p.imageFile.isProcessed || p.imageFile.isStaged
                return (
                  <div
                    key={p.sku}
                    onClick={() => setSelectedFile(p.imageFile)}
                    className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? "bg-emerald-500/10 border-l-4 border-emerald-500" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {hasImage ? (
                          <img src={p.imageFile.fileName.startsWith("NEW_") && p.imageFile.stagedUrl ? p.imageFile.stagedUrl : getImageUrl(p.imageFile, "processed")} alt={p.sku} className="w-full h-full object-cover" />
                        ) : (
                          <FiImage className="text-neutral-700" size={16} />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-200 font-mono truncate max-w-[150px]">{p.sku}</div>
                        <div className="text-[10px] text-neutral-400 mt-1 truncate max-w-[180px]">{p.name}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {p.imageFile.isProcessed && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-500/50" title="Processed" />
                      )}
                      {p.imageFile.isStaged && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" title="Staged" />
                      )}
                      {!hasImage && (
                        <span className="text-[9px] text-neutral-600 font-bold font-mono">NO IMG</span>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              // Regular Listing
              filteredFiles.map(file => {
                const isSelected = selectedFile?.fileName === file.fileName
                const hasMatch = file.matches.length > 0
                return (
                  <div
                    key={file.fileName}
                    onClick={() => !batchSelecting && setSelectedFile(file)}
                    className={`p-3.5 flex items-center justify-between transition-all cursor-pointer ${
                      isSelected ? "bg-emerald-500/10 border-l-4 border-emerald-500" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {batchSelecting && (
                        <input
                          type="checkbox"
                          checked={selectedFileNames.includes(file.fileName)}
                          onChange={() => handleToggleSelect(file.fileName)}
                          className="rounded border-neutral-700 text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-black/20"
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {file.isProcessed ? (
                          <img src={getImageUrl(file, "processed")} alt={file.stem} className="w-full h-full object-cover" />
                        ) : (
                          <FiImage className="text-neutral-600" size={16} />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-neutral-200 truncate max-w-[150px]">{file.fileName}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {hasMatch ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-semibold px-1 rounded truncate max-w-[120px]">
                              {file.matches[0].sku}
                            </span>
                          ) : (
                            <span className="text-[10px] bg-red-500/10 text-red-400 font-semibold px-1 rounded">No SKU Match</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {file.isProcessed && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-500/50" title="Processed" />
                      )}
                      {file.isStaged && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" title="Staged to Zoho/App" />
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {batchSelecting && selectedFileNames.length > 0 && (
            <div className="p-4 border-t border-white/10 bg-neutral-900/60 flex items-center gap-3">
              <button
                onClick={() => handleBatchAction("process")}
                className="flex-1 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 text-xs font-bold rounded-lg transition-colors"
              >
                Batch Process
              </button>
              <button
                onClick={() => handleBatchAction("stage")}
                className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-bold rounded-lg transition-colors"
              >
                Batch Publish
              </button>
            </div>
          )}
          {/* Storage Management Panel */}
          {storage && (
            <div className="p-3.5 border-t border-white/5 bg-neutral-900/40 text-[10px] space-y-2.5">
              <div className="flex justify-between items-center text-neutral-400 font-bold uppercase tracking-wider">
                <span>📁 Storage Management</span>
                {storage.archive.count > 0 && (
                  <button
                    onClick={handleClearArchive}
                    className="text-[9px] bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-neutral-950 font-black px-1.5 py-0.5 rounded transition-all uppercase tracking-widest"
                  >
                    Clear Archive
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-neutral-400 font-semibold font-mono">
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <div className="text-neutral-500 text-[8px] uppercase font-bold">Raw Pics</div>
                  <div className="text-xs text-white mt-0.5">{storage.raw.count} files</div>
                  <div className="text-[9px] text-neutral-500">{(storage.raw.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <div className="text-neutral-500 text-[8px] uppercase font-bold">Processed</div>
                  <div className="text-xs text-blue-400 mt-0.5">{storage.processed.count} files</div>
                  <div className="text-[9px] text-neutral-500">{(storage.processed.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <div className="text-neutral-500 text-[8px] uppercase font-bold">Archive</div>
                  <div className="text-xs text-amber-400 mt-0.5">{storage.archive.count} files</div>
                  <div className="text-[9px] text-neutral-500">{(storage.archive.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
                <div className="bg-black/20 p-2 rounded border border-white/5">
                  <div className="text-neutral-500 text-[8px] uppercase font-bold">Static App</div>
                  <div className="text-xs text-emerald-400 mt-0.5">{storage.public.count} files</div>
                  <div className="text-[9px] text-neutral-500">{(storage.public.size / 1024 / 1024).toFixed(1)} MB</div>
                </div>
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-white/5 bg-neutral-900/40 flex items-center justify-between text-xs">
              <button
                disabled={currentPage === 1 || loading}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-800 transition-colors font-bold"
              >
                Prev
              </button>
              <span className="text-neutral-400 font-mono">
                Page <span className="text-white font-bold">{currentPage}</span> of <span className="text-white font-bold">{totalPages}</span>
              </span>
              <button
                disabled={currentPage === totalPages || loading}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-2.5 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 disabled:opacity-30 disabled:hover:bg-neutral-800 transition-colors font-bold"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Right column: Image workspace / conflict resolution workspace (8cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {selectedConflictGroup ? (
            /* ──────────────── CONFLICT RESOLUTION WORKSPACE ──────────────── */
            <div className="glass-panel border border-white/10 rounded-2xl p-6 space-y-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
                    <FiAlertTriangle /> Duplicate Conflict Resolution: {selectedConflictGroup[0]}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Multiple pictures match the SKU prefix. Select the role for each variation, or discard/archive redundant photos.
                  </p>
                </div>
                <button
                  onClick={() => setSelectedConflictGroup(null)}
                  className="px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-bold transition-colors"
                >
                  Close Workspace
                </button>
              </div>

              {/* Side-by-side variation cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {selectedConflictGroup[1].map((file) => {
                  const currentMapping = conflictMappings[file.fileName] || 'discard'
                  return (
                    <div key={file.fileName} className="bg-neutral-900/60 border border-white/5 rounded-xl p-4 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-neutral-300 truncate max-w-[200px]">{file.fileName}</span>
                          <span className="text-[10px] text-neutral-500 font-semibold">{((f) => {
                            if (f.isStaged) return "Staged"
                            if (f.isProcessed) return "Processed"
                            return "Raw Source"
                          })(file)}</span>
                        </div>
                        <div className="h-44 w-full bg-black/40 rounded-lg overflow-hidden flex items-center justify-center border border-white/5 relative">
                          {file.isProcessed ? (
                            <img src={getImageUrl(file, "processed")} alt={file.stem} className="max-h-full max-w-full object-contain p-2" />
                          ) : (
                            <FiImage className="text-neutral-700" size={32} />
                          )}
                        </div>
                      </div>

                      {/* Mapping Select Dropdown */}
                      <div className="space-y-2">
                        <label className="block text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Assign Picture Role:</label>
                        <select
                          value={currentMapping}
                          onChange={(e) => setConflictMappings({ ...conflictMappings, [file.fileName]: e.target.value as any })}
                          className="w-full bg-neutral-850 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-500"
                        >
                          <option value="primary">Set as Primary Main Image</option>
                          <option value="detail_a">Set as Closeup A (Segment detail)</option>
                          <option value="detail_b">Set as Closeup B (Core profile)</option>
                          <option value="discard">Discard / Archive (Ignore)</option>
                        </select>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Submit resolution */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedConflictGroup(null)}
                  className="px-5 py-2 text-xs font-bold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResolveConflict}
                  disabled={actionLoading === "resolve-conflict"}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-black rounded-lg transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  {actionLoading === "resolve-conflict" ? <FiLoader className="animate-spin" /> : <FiCheck />}
                  <span>Resolve & Re-process Variations</span>
                </button>
              </div>
            </div>
          ) : selectedFile ? (
            /* ──────────────── REGULAR WORKSPACE ──────────────── */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* Carousel Previews (7cols) */}
              <div className="md:col-span-7 space-y-4">
                <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-4 flex flex-col items-center relative min-h-[450px] justify-center bg-neutral-900/20">
                  
                  {/* Current view indicator */}
                  <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                    {carouselIndex === 0 && "Raw Source Pic"}
                    {carouselIndex === 1 && "Processed Main Image"}
                    {carouselIndex === 2 && "Closeup A: Segment detail"}
                    {carouselIndex === 3 && "Closeup B: Body profile"}
                    {carouselIndex === 4 && "Closeup C: Blade Face"}
                    {carouselIndex === 5 && "Closeup D: Arbor Hub"}
                  </div>

                  {carouselIndex === 0 && (
                    selectedFile.fileName.startsWith("NEW_") ? (
                      selectedFile.stagedUrl ? (
                        <div className="text-center">
                          <span className="text-xs text-neutral-500 font-semibold block mb-2">{selectedFile.stem} (Staged)</span>
                          <img
                            src={selectedFile.stagedUrl}
                            alt="Staged Image"
                            className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5 mx-auto"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                          />
                          <p className="text-neutral-500 text-[10px] mt-2 font-medium">Staged product image (from Zoho or local)</p>
                          <input
                            type="file"
                            id="product-specific-upload"
                            onChange={async (e) => {
                              const uploaded = e.target.files?.[0]
                              if (!uploaded) return
                              setLoading(true)
                              const formData = new FormData()
                              const ext = uploaded.name.split('.').pop()
                              const cleanStem = selectedFile.stem.replace(/^NEW_/, '')
                              const targetName = `${cleanStem}.${ext}`
                              formData.append("file", uploaded, targetName)
                              try {
                                const res = await fetch("/api/admin/images/upload", { method: "POST", body: formData })
                                const data = await res.json()
                                if (data.success) { alert("Image uploaded!"); await fetchFiles(); setCarouselIndex(1) }
                                else alert("Upload failed: " + data.error)
                              } catch (err: any) { alert("Error: " + err.message) }
                              finally { setLoading(false) }
                            }}
                            accept="image/*"
                            className="hidden"
                          />
                          <button
                            onClick={() => document.getElementById("product-specific-upload")?.click()}
                            className="mt-3 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 mx-auto border border-blue-500/20"
                          >
                            <FiUploadCloud size={12} />
                            <span>Replace with Raw Photo</span>
                          </button>
                        </div>
                      ) : (
                      <div className="text-center p-8 flex flex-col items-center">
                        <FiImage size={48} className="text-neutral-600 mx-auto mb-4 animate-pulse" />
                        <p className="text-neutral-300 text-xs font-bold mb-4 font-mono">No photo uploaded for {selectedFile.stem.replace(/^NEW_/, '')} yet.</p>
                        <input
                          type="file"
                          id="product-specific-upload"
                          onChange={async (e) => {
                            const uploaded = e.target.files?.[0]
                            if (!uploaded) return
                            setLoading(true)
                            const formData = new FormData()
                            const ext = uploaded.name.split('.').pop()
                            const cleanStem = selectedFile.stem.replace(/^NEW_/, '')
                            const targetName = `${cleanStem}.${ext}`
                            formData.append("file", uploaded, targetName)

                            try {
                              const res = await fetch("/api/admin/images/upload", {
                                method: "POST",
                                body: formData
                              })
                              const data = await res.json()
                              if (data.success) {
                                alert("Image uploaded and mapped successfully!")
                                await fetchFiles()
                                setCarouselIndex(1)
                              } else {
                                alert("Upload failed: " + data.error)
                              }
                            } catch (err: any) {
                              alert("Error: " + err.message)
                            } finally {
                              setLoading(false)
                            }
                          }}
                          accept="image/*"
                          className="hidden"
                        />
                        <button
                          onClick={() => document.getElementById("product-specific-upload")?.click()}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-neutral-950 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                        >
                          <FiUploadCloud />
                          <span>Upload Photo</span>
                        </button>
                      </div>
                      )
                    ) : (
                      <div className="text-center">
                        <span className="text-xs text-neutral-500 font-semibold block mb-2">{selectedFile.fileName}</span>
                        <img
                          src={getImageUrl(selectedFile, "raw")}
                          alt="Raw Source"
                          className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5 mx-auto"
                        />
                        <p className="text-neutral-500 text-[10px] mt-2 font-medium">Original raw catalog photo</p>
                      </div>
                    )
                  )}

                  {carouselIndex === 1 && (
                    <img
                      src={getImageUrl(selectedFile, "processed")}
                      alt="Processed"
                      className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5"
                    />
                  )}

                  {carouselIndex === 2 && (
                    selectedFile.hasDetailA ? (
                      <img
                        src={getImageUrl(selectedFile, "detail_a")}
                        alt="Segment Detail"
                        className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5"
                      />
                    ) : (
                      <div className="text-center p-8">
                        <FiX className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-xs text-neutral-500 font-bold">Segment closeup detail not available.</p>
                      </div>
                    )
                  )}

                  {carouselIndex === 3 && (
                    selectedFile.hasDetailB ? (
                      <img
                        src={getImageUrl(selectedFile, "detail_b")}
                        alt="Shank Profile"
                        className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5"
                      />
                    ) : (
                      <div className="text-center p-8">
                        <FiX className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-xs text-neutral-500 font-bold">Shank profile detail not available.</p>
                      </div>
                    )
                  )}

                  {carouselIndex === 4 && (
                    selectedFile.hasDetailC ? (
                      <img
                        src={getImageUrl(selectedFile, "detail_c")}
                        alt="Face View"
                        className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5"
                      />
                    ) : (
                      <div className="text-center p-8">
                        <FiX className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-xs text-neutral-500 font-bold">Blade face view not available.</p>
                      </div>
                    )
                  )}

                  {carouselIndex === 5 && (
                    selectedFile.hasDetailD ? (
                      <img
                        src={getImageUrl(selectedFile, "detail_d")}
                        alt="Arbor Closeup"
                        className="max-h-[380px] w-auto object-contain rounded-lg shadow-lg border border-white/5"
                      />
                    ) : (
                      <div className="text-center p-8">
                        <FiX className="text-red-500 mx-auto mb-2" size={32} />
                        <p className="text-xs text-neutral-500 font-bold">Arbor hub closeup not available.</p>
                      </div>
                    )
                  )}
                </div>

                {/* Carousel Selector Buttons */}
                <div className="grid grid-cols-6 gap-2">
                  <button
                    onClick={() => setCarouselIndex(0)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      carouselIndex === 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    Raw Pic
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedFile.isProcessed) handleProcess(selectedFile)
                      else setCarouselIndex(1)
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      carouselIndex === 1 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {!selectedFile.isProcessed ? "Process Now" : "Standardised"}
                  </button>
                  <button
                    onClick={() => setCarouselIndex(2)}
                    disabled={!selectedFile.hasDetailA}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-30 ${
                      carouselIndex === 2 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    Closeup A
                  </button>
                  <button
                    onClick={() => setCarouselIndex(3)}
                    disabled={!selectedFile.hasDetailB}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-30 ${
                      carouselIndex === 3 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    Closeup B
                  </button>
                  <button
                    onClick={() => setCarouselIndex(4)}
                    disabled={!selectedFile.hasDetailC}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-30 ${
                      carouselIndex === 4 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    Face C
                  </button>
                  <button
                    onClick={() => setCarouselIndex(5)}
                    disabled={!selectedFile.hasDetailD}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all disabled:opacity-30 ${
                      carouselIndex === 5 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-900 border-white/5 hover:bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    Arbor D
                  </button>
                </div>
              </div>

              {/* Editing & Actions Panel (5cols) */}
              <div className="md:col-span-5 space-y-6">
                
                {/* Photo Editing Tools */}
                <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                      <FiSliders /> Photo Editor Tools
                    </h3>
                    {lastSaved && (
                      <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        ✓ Saved {lastSaved}
                      </span>
                    )}
                  </div>

                  {/* Background Removal */}
                  <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">✨ AI Background Removal</div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleRemoveBg('white')}
                        disabled={bgRemovalLoading}
                        className="py-1.5 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all disabled:opacity-40"
                      >
                        {bgRemovalLoading ? '...' : 'White BG'}
                      </button>
                      <button
                        onClick={() => handleRemoveBg('transparent')}
                        disabled={bgRemovalLoading}
                        className="py-1.5 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all disabled:opacity-40"
                      >
                        Transparent
                      </button>
                      <button
                        onClick={() => handleRemoveBg('gradient')}
                        disabled={bgRemovalLoading}
                        className="py-1.5 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all disabled:opacity-40"
                      >
                        Gradient
                      </button>
                    </div>
                    {bgRemovalLoading && (
                      <div className="text-[10px] text-purple-300 text-center animate-pulse font-semibold">Removing background with AI... (may take 15-30s)</div>
                    )}
                  </div>

                  <div className="space-y-3.5 text-xs">
                    <div>
                      <div className="flex justify-between text-neutral-400 mb-1">
                        <span className="flex items-center gap-1"><FiSun /> Brightness</span>
                        <span className="font-bold">{brightness.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range" min="0.5" max="2.0" step="0.1"
                        value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 mb-1">
                        <span className="flex items-center gap-1"><FiSun /> Contrast</span>
                        <span className="font-bold">{contrast.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range" min="0.5" max="2.0" step="0.1"
                        value={contrast} onChange={e => setContrast(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 mb-1">
                        <span className="flex items-center gap-1">🔪 Sharpness</span>
                        <span className="font-bold">{sharpness.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range" min="0.5" max="3.0" step="0.1"
                        value={sharpness} onChange={e => setSharpness(parseFloat(e.target.value))}
                        className="w-full accent-blue-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 mb-1">
                        <span className="flex items-center gap-1">🎨 Saturation</span>
                        <span className="font-bold">{saturation.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range" min="0.5" max="2.0" step="0.1"
                        value={saturation} onChange={e => setSaturation(parseFloat(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                    </div>

                    {/* Toggle Enhancements */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setAutoLevels(!autoLevels)}
                        className={`py-2 rounded-lg border text-[10px] font-bold transition-all ${
                          autoLevels ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-neutral-800 border-white/5 hover:bg-neutral-700 text-neutral-400'
                        }`}
                      >
                        ⚡ Auto-Levels {autoLevels ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => setDenoise(!denoise)}
                        className={`py-2 rounded-lg border text-[10px] font-bold transition-all ${
                          denoise ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-neutral-800 border-white/5 hover:bg-neutral-700 text-neutral-400'
                        }`}
                      >
                        🔇 Denoise {denoise ? 'ON' : 'OFF'}
                      </button>
                    </div>

                    <div>
                      <div className="flex justify-between text-neutral-400 mb-1">
                        <span className="flex items-center gap-1"><FiRotateCw /> Rotation</span>
                        <span className="font-bold">{rotation}°</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {[0, 90, 180, 270].map(angle => (
                          <button
                            key={angle} onClick={() => setRotation(angle)}
                            className={`py-1 rounded border text-[10px] font-bold ${
                              rotation === angle ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-neutral-800 border-white/5 hover:bg-neutral-700 text-neutral-400"
                            }`}
                          >
                            {angle}°
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Custom Attributes & Text Overlays */}
                <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-4 shadow-2xl">
                  <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                    <FiTag /> Attribute Pill Badges
                  </h3>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-neutral-500 font-bold mb-1 uppercase">Blade Size</label>
                      <input
                        type="text" placeholder="e.g. 14&quot;" value={badgeSize}
                        onChange={e => setBadgeSize(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 font-bold mb-1 uppercase">Seg Height</label>
                      <input
                        type="text" placeholder="e.g. 12MM" value={badgeSegHeight}
                        onChange={e => setBadgeSegHeight(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 font-bold mb-1 uppercase">Bond Type</label>
                      <select
                        value={badgeBond} onChange={e => setBadgeBond(e.target.value)}
                        className="w-full bg-neutral-900 border border-white/10 rounded-lg px-2 py-1.5 text-white outline-none focus:border-emerald-500"
                      >
                        <option value="">Auto (From Desc)</option>
                        <option value="SOFT">SOFT</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-neutral-500 font-bold mb-1 uppercase">Blade Type</label>
                      <input
                        type="text" placeholder="e.g. TURBO" value={badgeType}
                        onChange={e => setBadgeType(e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleApplyEdits}
                    disabled={actionLoading === "edit"}
                    className="w-full py-2 bg-blue-500 hover:bg-blue-400 text-neutral-950 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
                  >
                    {actionLoading === "edit" ? <FiLoader className="animate-spin" /> : <FiEdit />}
                    <span>Apply & Preview Edits</span>
                  </button>
                </div>

                {/* SKU Matching & Staging */}
                <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-4 shadow-2xl">
                  <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-widest flex items-center gap-1.5">
                    <FiCheck /> Stage to Zoho & App
                  </h3>

                  {/* Matches Display */}
                  <div className="space-y-3">
                    <div className="text-xs">
                      <div className="text-neutral-500 font-bold uppercase text-[10px] mb-1">Database Product Association</div>
                      {selectedFile.matches.length > 0 ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex justify-between items-start">
                          <div>
                            <div className="font-mono font-bold text-emerald-400">{selectedFile.matches[0].sku}</div>
                            <div className="text-neutral-200 mt-1 font-semibold">{selectedFile.matches[0].name}</div>
                            <div className="text-neutral-500 text-[10px] mt-0.5">{selectedFile.matches[0].category}</div>
                          </div>
                          <span className="text-neutral-400 font-bold">${selectedFile.matches[0].price.toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 font-semibold">
                          No automatic database association.
                        </div>
                      )}
                    </div>

                    {/* Manual mapping input */}
                    <div className="text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-neutral-500 font-bold uppercase">Manual SKU Mapping Override</label>
                        <button
                          onClick={() => setEditingSku(!editingSku)}
                          className="text-[10px] text-emerald-400 hover:text-white"
                        >
                          {editingSku ? "Cancel" : "Change Map"}
                        </button>
                      </div>
                      {editingSku && (
                        <div className="flex gap-2">
                          <input
                            type="text" placeholder="Type target SKU..." value={manualSku}
                            onChange={e => setManualSku(e.target.value)}
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-2.5 py-1.5 text-white outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => {
                              if (manualSku) {
                                const updated = { ...selectedFile, matches: [{ id: "temp", sku: manualSku, name: "Custom Manual Map", price: 0, category: "Manual" }] }
                                setSelectedFile(updated)
                                setEditingSku(false)
                              }
                            }}
                            className="px-3 py-1.5 bg-neutral-800 rounded-lg text-white font-bold"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const targetSku = selectedFile.matches?.[0]?.sku || selectedFile.cleanedStem
                        handlePublish(selectedFile, targetSku)
                      }}
                      disabled={actionLoading === "stage" || (!selectedFile.matches.length && !selectedFile.cleanedStem)}
                      className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-neutral-950 text-sm font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                    >
                      {actionLoading === "stage" ? <FiLoader className="animate-spin" /> : <FiZap />}
                      <span>Publish Image (Zoho + Catalog)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel border border-white/10 rounded-2xl p-16 text-center text-neutral-500 shadow-2xl flex flex-col items-center justify-center h-[500px]">
              <FiImage size={48} className="text-neutral-700 mb-4 animate-pulse" />
              <p className="font-semibold text-neutral-400">No Item Selected</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">Select a picture or conflict group from the sidebar directory listing to standardize, crop, edit and publish.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
