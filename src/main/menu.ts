import { app, BrowserWindow, clipboard, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { AUTHOR, LINKS, USDT_TRC20 } from '../shared/links'
import { appState } from './app-state'
import { checkForUpdates } from './updater'

function showAbout(win: BrowserWindow | null): void {
  dialog
    .showMessageBox(win!, {
      type: 'info',
      title: 'О сервисе',
      message: `LS Music  v${app.getVersion()}`,
      detail:
        'Музыка по баллам канала Twitch с анимацией винила для OBS.\n' +
        'Яндекс.Музыка и Spotify.\n\n' +
        `Автор: ${AUTHOR}`,
      buttons: ['Twitch автора', 'GitHub', 'Закрыть'],
      defaultId: 2,
      cancelId: 2,
      noLink: true
    })
    .then(({ response }) => {
      if (response === 0) shell.openExternal(LINKS.twitch)
      else if (response === 1) shell.openExternal(LINKS.github)
    })
}

function quit(): void {
  appState.quitting = true
  app.quit()
}

export function buildAppMenu(getWin: () => BrowserWindow | null): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Сервис',
      submenu: [
        { label: 'О сервисе', click: () => showAbout(getWin()) },
        { type: 'separator' },
        { label: 'Проверить обновления', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'Выход', click: quit }
      ]
    },
    { label: 'GitHub', click: () => shell.openExternal(LINKS.github) },
    { label: 'Купить VPN', click: () => shell.openExternal(LINKS.vpnBot) },
    {
      label: 'Поддержать проект',
      submenu: [
        { label: 'DonationAlerts', click: () => shell.openExternal(LINKS.donate) },
        {
          label: 'USDT (TRC20) — скопировать адрес',
          click: () => {
            clipboard.writeText(USDT_TRC20)
            dialog.showMessageBox(getWin()!, {
              type: 'info',
              message: 'Адрес USDT (TRC20) скопирован в буфер обмена',
              detail: USDT_TRC20
            })
          }
        }
      ]
    },
    { label: 'Twitch автора', click: () => shell.openExternal(LINKS.twitch) }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
