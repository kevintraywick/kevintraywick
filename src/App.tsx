import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Footer from './components/Footer'
import pastryImg from './assets/pastry.png'
import bubbleImg from './assets/bubble.png'
import penImg from './assets/pen.png'
import blackmoorSplashImg from './assets/blackmoor-splash.webp'
import windImg from './assets/windstorm.png'
import darkSkiesImg from './assets/darkskies-purple.jpg'
import backWorkoutImg from './assets/back-workout-card.png'
import { PhotoPanel } from './components/PhotoPanel'
import Blog from './pages/Blog'
import BlogEntry from './pages/BlogEntry'

const kFont = { fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900 } as const

function Homepage() {
  const [hoverText, setHoverText] = useState<string | null>(null)
  const hover = (text: string) => ({ onMouseEnter: () => setHoverText(text), onMouseLeave: () => setHoverText(null) })

  return (
    <div className="grid h-screen w-screen bg-white" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)' }}>
      {/* Photos — position 1 (r1c1) */}
      <div className="relative overflow-hidden bg-black" {...hover('My photos')}>
        <PhotoPanel />
      </div>
      {/* Text Me — position 2 (r1c2) */}
      <a href="sms:+12068608292" className="overflow-hidden" {...hover('Text me here')}>
        <img src={bubbleImg} alt="Text Me" className="w-full h-full object-cover" />
      </a>
      {/* Back Workout PDF — position 3 (r1c3) */}
      <div className="relative overflow-hidden">
        <a href="/workout/back-workout.pdf" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('do it!')}>
          <img src={backWorkoutImg} alt="A 20-Minute Workout to Keep Your Body Limber" className="w-full h-full object-cover" />
        </a>
      </div>

      {/* Blackmoor — position 4 (r2c1) */}
      <div className="relative overflow-hidden">
        <a href="https://blackmoor.up.railway.app" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('D&D')}>
          <img src={blackmoorSplashImg} alt="Blackmoor — Season of the Witch" className="w-full h-full object-cover" style={{ objectPosition: 'center 22%' }} />
        </a>
      </div>
      {/* K — position 5 (center) */}
      <div className="relative flex items-center justify-center">
        <span style={{ ...kFont, fontSize: 'clamp(120px, 18vw, 280px)', lineHeight: 1, opacity: hoverText ? 0 : 1, transition: 'opacity 0.3s' }}>
          K
        </span>
        {hoverText && (
          <span className="absolute inset-[5%] flex items-center justify-center text-center" style={{ ...kFont, fontSize: 'clamp(28px, 5vw, 72px)', lineHeight: 1.1, opacity: 1, transition: 'opacity 0.3s', whiteSpace: 'pre-line' }}>
            {hoverText}
          </span>
        )}
      </div>
      {/* JustEdit — position 6 (r2c3) */}
      <div className="relative overflow-hidden">
        <a href="/justedit/justedit.html" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('Write me here')}>
          <img src={penImg} alt="JustEdit" className="w-full h-full object-cover" />
        </a>
      </div>

      {/* Dark Skies — position 7 (r3c1) */}
      <div className="relative overflow-hidden">
        <a href="https://darkskies.kevintraywick.com" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('Dark Skies,\nWest Texas 2026')}>
          <img src={darkSkiesImg} alt="Dark Skies — West Texas 2026" className="w-full h-full object-cover" />
        </a>
      </div>
      {/* Fast French — position 8 (r3c2) */}
      <div className="relative overflow-hidden">
        <a href="/fast-french/" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('Fast French,\nmy French learning game')}>
          <img src={pastryImg} alt="Fast French" className="w-full h-full object-cover" />
        </a>
        {/* relocated nav dots — bottom-left */}
        <a
          href="/blog"
          aria-label="Go to blog"
          className="absolute z-10 w-5 h-5 rounded-full flex items-center justify-center text-white leading-none"
          style={{ background: '#999', opacity: 0.4, left: '8px', bottom: '8px', fontSize: '16px' }}
        >
          +
        </a>
        <a
          href="/design"
          aria-label="Design language builder"
          className="absolute z-10 w-5 h-5 rounded-full flex items-center justify-center text-white leading-none"
          style={{ background: '#999', opacity: 0.4, left: '34px', bottom: '8px', fontSize: '11px' }}
        >
          D
        </a>
        {/* /cc and /me dots — bottom-right of this pane */}
        <a
          href="/cc"
          aria-label="cc"
          className="absolute z-10 w-5 h-5 rounded-full block"
          style={{ background: '#999', opacity: 0.4, right: '34px', bottom: '8px' }}
        />
        <a
          href="/me"
          aria-label="me"
          className="absolute z-10 w-5 h-5 rounded-full block"
          style={{ background: '#5af', opacity: 0.4, right: '8px', bottom: '8px' }}
        />
      </div>
      {/* Wind — position 9 (r3c3) */}
      <div className="relative overflow-hidden">
        <a href="https://meticulous-eagerness-production-411f.up.railway.app" target="_blank" rel="noopener noreferrer" className="block w-full h-full" {...hover('Windy,\nmy real time wind project')}>
          <img src={windImg} alt="Wind" className="w-full h-full object-cover" />
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Homepage />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/blog/:id" element={<BlogEntry />} />
      </Routes>
      <Footer />
    </>
  )
}
