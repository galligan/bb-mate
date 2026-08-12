# Third-party notices

The BB Mate local artifact bundles or embeds output from the packages and fonts
below. `THIRD_PARTY_LICENSES.md` is generated from the exact installed versions'
license and copyright files and adds explicit notices for transitive code
flattened into Ladle's distributed browser client. Both files are packaged and
checked before any public distribution decision.

| Component                          | License    | Upstream                                        |
| ---------------------------------- | ---------- | ----------------------------------------------- |
| Base UI React                      | MIT        | <https://github.com/mui/base-ui>                |
| class-variance-authority           | Apache-2.0 | <https://github.com/joe-bell/cva>               |
| clsx                               | MIT        | <https://github.com/lukeed/clsx>                |
| Geist variable font via Fontsource | OFL-1.1    | <https://github.com/fontsource/font-files>      |
| Inter variable font via Fontsource | OFL-1.1    | <https://github.com/fontsource/font-files>      |
| Hugeicons Core Free Icons          | MIT        | <https://github.com/hugeicons/hugeicons>        |
| Hugeicons React                    | MIT        | <https://github.com/hugeicons/hugeicons>        |
| Ladle React                        | MIT        | <https://github.com/tajo/ladle>                 |
| Ladle embedded client dependencies | MIT / ISC  | See `THIRD_PARTY_LICENSES.md`                   |
| Lucide React                       | ISC        | <https://github.com/lucide-icons/lucide>        |
| Radix Slot                         | MIT        | <https://github.com/radix-ui/primitives>        |
| Radix Tooltip                      | MIT        | <https://github.com/radix-ui/primitives>        |
| React                              | MIT        | <https://github.com/facebook/react>             |
| React DOM                          | MIT        | <https://github.com/facebook/react>             |
| saxes                              | ISC        | <https://github.com/lddubeau/saxes>             |
| semver                             | ISC        | <https://github.com/npm/node-semver>            |
| tailwind-merge                     | MIT        | <https://github.com/dcastil/tailwind-merge>     |
| tw-animate-css                     | MIT        | <https://github.com/Wombosvideo/tw-animate-css> |
| xmlchars                           | MIT        | <https://github.com/lddubeau/xmlchars>          |
| Zod                                | MIT        | <https://github.com/colinhacks/zod>             |

The generated payload includes Base UI's runtime dependency closure, the Radix
Slot and Tooltip runtime dependency closure, Ladle, classnames, Prism React
Renderer and PrismJS, PropTypes and React Is, React and scheduler, the Focus
Lock/React Remove Scroll family, Reach UI dialog, tslib, and the inspection
parser dependency closure. This inventory and those notices cover third-party
components, including the runtime protocol's bundled Zod schema implementation,
only. BB Mate itself is distributed under the MIT License included as `LICENSE`
in the package.
