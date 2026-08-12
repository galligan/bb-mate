# Product naming and compatibility

The product is **bb Plugin Studio**. Inside bb, its navigation item and panel
title use the shorter **Plugin Studio**. Its purpose line is:

> Build, inspect, and preview bb plugins.

The GitHub repository is `galligan/bb-plugin-studio`.

## Compatibility identities

The product rename does not rename installed or published identities. The
following values remain stable so existing settings, storage, runtime catalogs,
skills, routes, scripts, and package consumers continue to work:

| Identity                          | Stable value                                  |
| --------------------------------- | --------------------------------------------- |
| npm CLI package and command       | `bb-mate`                                     |
| workspace package scope           | `@bb-mate/*`                                  |
| bb plugin package                 | `bb-plugin-mate`                              |
| bb plugin ID and source directory | `mate`, `plugins/mate`                        |
| packaged runtime artifact         | `bb-mate`                                     |
| plugin runtime data root          | `<bb-data>/plugins/mate/runtime`              |
| panel route                       | `workbench`                                   |
| skill ID and path                 | `plugin-workbench`, `skills/plugin-workbench` |

These names are compatibility identifiers, not current product copy. Changing
one requires a separately reviewed migration that proves existing installs can
open with their settings, KV data, database, runtime catalog, target identities,
and skills intact. A remove-and-reinstall migration is not acceptable.

## Historical references

Changelogs, completed plans, and archived alpha reports may retain the names
that were true when their evidence was recorded. Current product surfaces,
package metadata, issue templates, help output, and maintained documentation
must use bb Plugin Studio or Plugin Studio.

[GitHub redirects the former repository URL after a repository is
renamed](https://docs.github.com/en/enterprise-cloud@latest/repositories/creating-and-managing-repositories/renaming-a-repository).
The former `galligan/bb-mate` name must not be reused, because doing so would
break that redirect. GitHub Pages and reusable Actions require separate
handling if either is introduced later.
