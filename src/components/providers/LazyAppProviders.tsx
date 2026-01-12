'use client'

import dynamic from 'next/dynamic'

const LazyAppProviders = dynamic(() => import('./AppProviders'), {
    ssr: false
})

export default LazyAppProviders