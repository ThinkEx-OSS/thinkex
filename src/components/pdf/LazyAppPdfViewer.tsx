'use client'

import dynamic from 'next/dynamic'

const LazyAppPdfViewer = dynamic(() => import('./AppPdfViewer'), {
 ssr: false
})

export default LazyAppPdfViewer