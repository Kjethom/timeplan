// Komponenten lagrer via window.storage, som bare finnes i Claude.
// Her er en erstatning som skriver til nettleserens localStorage.
if (!window.storage) {
  window.storage = {
    get: async (key) => {
      const value = localStorage.getItem(key)
      return value === null ? null : { key, value }
    },
    set: async (key, value) => {
      localStorage.setItem(key, value)
      return { key, value }
    },
    delete: async (key) => {
      localStorage.removeItem(key)
      return { key, deleted: true }
    },
    list: async (prefix = '') => ({
      keys: Object.keys(localStorage).filter((k) => k.startsWith(prefix)),
    }),
  }
}
