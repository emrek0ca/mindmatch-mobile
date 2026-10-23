const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

module.exports = function withIosSceneLifecycle(config) {
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('MindMatch requires a Swift iOS AppDelegate.');
    }

    let source = mod.modResults.contents;
    const legacyClass = 'class AppDelegate: ExpoAppDelegate {';
    if (source.includes(legacyClass)) {
      source = source.replace(legacyClass, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    }
    if (!source.includes('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')) {
      throw new Error('Unable to enable the iOS scene lifecycle in AppDelegate.');
    }

    const legacyStartup = /#if os\(iOS\) \|\| os\(tvOS\)\s+window = UIWindow\(frame: UIScreen\.main\.bounds\)\s+factory\.startReactNative\([\s\S]*?\)\s+#endif/;
    if (legacyStartup.test(source)) {
      source = source.replace(legacyStartup, '// ExpoAppSceneDelegate creates the window and starts React Native.');
    } else if (source.includes('factory.startReactNative(')) {
      throw new Error('Unexpected iOS startup code; scene lifecycle was not configured.');
    }

    mod.modResults.contents = source;
    return mod;
  });

  return withInfoPlist(config, mod => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
        }],
      },
    };
    return mod;
  });
};
