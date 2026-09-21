import '@testing-library/jest-dom'
import { JSDOM } from 'jsdom'

// Node's experimental storage can shadow jsdom's browser Storage in Vitest.
const storageWindow = new JSDOM('', { url: 'http://localhost:5174' }).window
Object.defineProperty(window, 'localStorage', { configurable: true, value: storageWindow.localStorage })
Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storageWindow.sessionStorage })
