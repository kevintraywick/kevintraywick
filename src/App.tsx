import { Routes, Route } from 'react-router-dom'
import Footer from './components/Footer'
import { PhotoPanel } from './components/PhotoPanel'
import { ThoughtPanel } from './components/ThoughtPanel'
import { NameFlip } from './components/NameFlip'
import Blog from './pages/Blog'
import BlogEntry from './pages/BlogEntry'

// Three panes, each one cell of the old 3×3 grid: photos, the name, thoughts.
// Side by side across the middle row on a wide screen; stacked on a phone.
function Homepage() {
  return (
    <div className="grid h-dvh w-screen bg-white grid-cols-1 grid-rows-3 pb-8 md:pb-0 md:grid-cols-3">
      <section aria-label="Photos" className="relative overflow-hidden bg-black md:row-start-2">
        <PhotoPanel />
      </section>
      <div className="flex items-center justify-center md:row-start-2">
        <NameFlip />
      </div>
      <section aria-label="Thoughts" className="relative overflow-hidden md:row-start-2">
        <ThoughtPanel />
      </section>
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
