/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = {
  appId: "com.vibetunnel.app",
  productName: "VibeTunnel",
  directories: {
    output: "dist"
  },
  files: [
    "dist/**/*",
    "assets/**/*"
  ],
  extraResources: [
    {
      from: "bin",
      to: "bin",
      filter: ["**/*"]
    },
    {
      from: "../web/public",
      to: "web",
      filter: ["**/*"]
    }
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: "assets/icon.icns",
    identity: null,
    target: [
      {
        target: "dmg",
        arch: ["x64", "arm64"]
      },
      {
        target: "zip",
        arch: ["x64", "arm64"]
      }
    ]
  },
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications"
      }
    ]
  },
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      },
      {
        target: "portable",
        arch: ["x64"]
      }
    ],
    icon: "assets/icon.ico"
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  linux: {
    target: [
      {
        target: "AppImage",
        arch: ["x64"]
      },
      {
        target: "deb",
        arch: ["x64"]
      },
      {
        target: "rpm",
        arch: ["x64"]
      }
    ],
    category: "Development",
    icon: "assets/icon.png"
  },
  publish: {
    provider: "github",
    owner: "vibetunnel",
    repo: "vibetunnel"
  }
};