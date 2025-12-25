import { Moon, Sun, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useThemeStore } from '@/store/themeStore'

const themeLabels = {
  light: 'Light',
  dark: 'Dark',
  retro: 'HAM Radio',
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore()

  const getNextTheme = () => {
    if (theme === 'light') return 'dark'
    if (theme === 'dark') return 'retro'
    return 'light'
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={`${themeLabels[theme]} → ${themeLabels[getNextTheme()]}`}
      className="rounded-full h-8 w-8"
    >
      {theme === 'light' && <Sun className="w-4 h-4" />}
      {theme === 'dark' && <Moon className="w-4 h-4" />}
      {theme === 'retro' && <Radio className="w-4 h-4" />}
    </Button>
  )
}
