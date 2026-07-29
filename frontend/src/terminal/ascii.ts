/** ASCII art shared by `neofetch`, the console greeting and the generated résumé. */

/**
 * Drops the leading/trailing blank lines a template literal introduces without
 * touching indentation — `.trim()` would eat the first line's leading spaces and
 * shear the top row out of alignment.
 */
function block(raw: string): string {
  return raw.replace(/^\n/, '').replace(/\n[ \t]*$/, '')
}

export const LOGO = block(String.raw`
   ______            _         _
  / ____/___  __  __| |__     / /_  ____ _/ /_
 / /   / __ \/ / / / '_ \    / __ \/ __  / __/
/ /___/ /_/ / /_/ /| |_) |  / /_/ / /_/ / /_
\____/\____/\__,_/ |_.__/  /_.___/\__,_/\__/
`)

/** Compact mark for the neofetch two-column layout. */
export const MARK = block(String.raw`
    .--.
   |o_o |
   |:_/ |
  //   \ \
 (|     | )
/'\_   _/'\
\___)=(___/
`)

export const COW = block(String.raw`
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
`)

export const TRAIN = block(String.raw`
      ====        ________                ___________
  _D _|  |_______/        \__I_I_____===__|_________|
   |(_)---  |   H\________/ |   |        =|___ ___|
   /     |  |   H  |  |     |   |         ||_| |_||
  |      |  |   H  |__--------------------| [___] |
  | ________|___H__/__|_____/[][]~\_______|       |
  |/ |   |-----------I_____I [][] []  D   |=======|__
`)
