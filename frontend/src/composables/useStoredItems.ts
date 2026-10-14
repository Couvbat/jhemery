import { onScopeDispose, shallowRef, type Ref } from 'vue'
import { onStorageChange, storedItems, type StoredItem } from '@/lib/storage-keys'

/**
 * What is stored, kept current for as long as the calling scope lives. `/privacy` lists it
 * under a navbar that writes (the scheme, the language), with the terminal and the palette
 * a key away, so a list read once said "not set" for a key just made, and offered to clear
 * less than was there. Shallow, because the rows match an item to its entry by identity,
 * and a deep ref would hand back a proxy of the entry instead.
 */
export function useStoredItems(): Ref<StoredItem[]> {
  const items = shallowRef(storedItems())
  onScopeDispose(
    onStorageChange(() => {
      items.value = storedItems()
    }),
  )
  return items
}
