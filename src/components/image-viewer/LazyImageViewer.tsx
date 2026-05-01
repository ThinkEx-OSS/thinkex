'use client'

import dynamic from 'next/dynamic'

const LazyImageViewer = dynamic(() => import('./ImageViewer'), {
  ssr: false
})

export default LazyImageViewer
