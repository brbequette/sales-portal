"use client"

import React, { useEffect, useState, useRef } from "react"
import {
  FiImage, FiUploadCloud, FiCpu, FiCheck, FiX, FiRefreshCw, FiLoader,
  FiEdit, FiZap, FiPlus, FiArrowRight, FiFileText, FiTag, FiSearch, FiSliders, FiSun, FiRotateCw
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
  isStaged: boolean
  stagedUrl: string | null
  matches: Match[]
}

export default function ImageManagerPage() {
  const [files, setFiles] = useState<ImageFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<ImageFile | null>(null)
  
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
  
  // Matching and uploading state
  const [manualSku, setManualSku] = useState("")
  const [editingSku, setEditingSku] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [batchSelecting, setBatchSelecting] = useState(false)
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([])
  
  // Catalog extraction state
  const [catalogFile, setCatalogFile] = useState<File | null>(null)
  const [catalogProgress, setCatalogProgress] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)
  const catalogInputRef = useRef<HTMLInputElement>(null)

  // Fetch images listing
  const fetchFiles = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/images")
      const data = await res.json()
      if (data.success) {
        setFiles(data.files || [])
        // Maintain selection if still exists
        if (selectedFile) {
          const current = data.files.find((f: ImageFile) => f.fileName === selectedFile.fileName)
          if (current) setSelectedFile(current)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFiles()
  }, [])

  // Auto populate badge fields when selected file changes
  useEffect(() => {
    if (selectedFile) {
      setBrightness(1.0)
      setContrast(1.0)
      setRotation(0)
      setBadgeSize("")
      setBadgeSegHeight("")
      setBadgeBond("")
      setBadgeType("")
      setManualSku("")
      setCarouselIndex(selectedFile.isProcessed ? 1 : 0)
    }
  }, [selectedFile])

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
          // Find SKU match
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

  // Get image paths for previews
  const getImageUrl = (file: ImageFile, type: "raw" | "processed" | "detail_a" | "detail_b") => {
    // Note: Netlify dev or local dev accesses C:\Users\titan\Documents\Titan Diamond\All Pics directly or copies to public
    // To allow previewing raw files, we can host them dynamically or copy them to public. 
    // For local dev, a simple client-side link or caching is done. Let's return standard relative paths.
    // If it's already staged or processed, we can preview from our public product-images or stage directories.
    if (type === "processed" && file.isProcessed) {
      // In local dev, we stage processed files to public/product-images. 
      // If it isn't copied to public yet, we can serve it if we add static mapping, or just fetch it.
      // But we can check if it exists in public.
      return `/product-images/${file.stem}.png`
    }
    if (type === "detail_a" && file.hasDetailA) {
      return `/product-images/${file.stem}_detail_a.png`
    }
    if (type === "detail_b" && file.hasDetailB) {
      return `/product-images/${file.stem}_detail_b.png`
    }
    
    // Fallback: the app's api endpoint can serve local images dynamically as a fallback!
    // Let's make sure we have a fallback or proxy. We can just serve `/api/zoho-image?sku=SKU` or similar.
    return `/product-images/${file.stem}.png` // default fallback
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
        <div className="lg:col-span-4 glass-panel border border-white/10 rounded-2xl overflow-hidden flex flex-col h-[700px] shadow-2xl">
          <div className="p-4 border-b border-white/10 bg-neutral-900/60 flex items-center justify-between">
            <h2 className="text-sm font-bold text-neutral-200">All Pics Directory ({files.length})</h2>
            <button
              onClick={() => {
                setBatchSelecting(!batchSelecting)
                setSelectedFileNames([])
              }}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                batchSelecting ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-neutral-800 text-neutral-400 hover:text-white"
              }`}
            >
              {batchSelecting ? "Cancel Batch" : "Select Multiple"}
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
            {files.map(file => {
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
                      <span className="w-2 h-2 rounded-full bg-blue-400 shadow-lg shadow-blue-500/50" title="Processed (Standardised)" />
                    )}
                    {file.isStaged && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50" title="Staged to Zoho/App" />
                    )}
                  </div>
                </div>
              )
            })}
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
        </div>

        {/* Right column: Image workspace (8cols) */}
        <div className="lg:col-span-8 space-y-6">
          {selectedFile ? (
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
                  </div>

                  {carouselIndex === 0 && (
                    <div className="text-center">
                      {/* Raw file path */}
                      <span className="text-xs text-neutral-500 font-semibold block mb-2">{selectedFile.fileName}</span>
                      <FiImage size={64} className="text-neutral-700 mx-auto my-12" />
                      <p className="text-neutral-500 text-xs font-medium">Original local source image preview</p>
                    </div>
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
                </div>

                {/* Carousel Selector Buttons */}
                <div className="grid grid-cols-4 gap-2">
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
                                // Add temporary mapping locally to preview before staging
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
              <p className="font-semibold text-neutral-400">No Image Selected</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-xs mx-auto">Select a picture from the sidebar directory listing to standardize, crop, edit and publish.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
