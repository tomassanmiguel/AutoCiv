import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Editor from './Editor.jsx'
import '../index.css'
import './Editor.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
)
