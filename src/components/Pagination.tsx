import React from "react"
import { FiChevronLeft, FiChevronRight } from "react-icons/fi"

interface PaginationProps {
  currentPage: number
  pageSize: number | "All"
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number | "All") => void
}

export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const isAll = pageSize === "All"
  const actualPageSize = isAll ? totalItems : (pageSize as number)
  const totalPages = isAll || totalItems === 0 ? 1 : Math.ceil(totalItems / actualPageSize)

  const startItem = totalItems === 0 ? 0 : isAll ? 1 : (currentPage - 1) * actualPageSize + 1
  const endItem = isAll ? totalItems : Math.min(currentPage * actualPageSize, totalItems)

  const handlePrev = () => {
    if (currentPage > 1) onPageChange(currentPage - 1)
  }

  const handleNext = () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1)
  }

  if (totalItems === 0) return null

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-4 border-t border-white/10 glass-panel/50">
      <div className="flex items-center gap-4 text-xs text-neutral-400">
        <div>
          Showing <span className="font-bold text-white">{startItem}</span> to <span className="font-bold text-white">{endItem}</span> of <span className="font-bold text-white">{totalItems}</span> results
        </div>
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value
              onPageSizeChange(val === "All" ? "All" : Number(val))
            }}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="All">All</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handlePrev}
          disabled={currentPage === 1 || isAll}
          className="p-1.5 rounded bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiChevronLeft size={16} />
        </button>
        <span className="text-xs text-neutral-400 font-medium px-2">
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={handleNext}
          disabled={currentPage === totalPages || isAll}
          className="p-1.5 rounded bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

export function usePagination<T>(items: T[] | undefined | null, defaultPageSize: number | "All" = "All") {
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState<number | "All">(defaultPageSize)

  // Reset to page 1 if items length changes significantly or if pageSize changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [items?.length, pageSize])

  const paginatedItems = React.useMemo(() => {
    if (!items) return []
    if (pageSize === "All") return items
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, currentPage, pageSize])

  return {
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    paginatedItems,
  }
}
