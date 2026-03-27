import type { Metadata, Viewport } from 'next'
import { Sora } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const sora = Sora({ 
  subsets: ["latin"],
  variable: '--font-sora',
  weight: ['400', '500', '600', '700', '800']
});

export const metadata: Metadata = {
  title: 'EthiCare - Learn Medical Ethics by Living the Decision',
  description: 'Interactive medical ethics simulation platform for healthcare professionals and students',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#1B6B7D',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
