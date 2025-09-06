module.exports = {
  // ...
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'me',
          name: 'atefcodes'
        },
        prerelease: true
      }
    }
  ]
};