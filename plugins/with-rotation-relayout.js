const {withMainActivity} = require('@expo/config-plugins');

// Locking the orientation while a screen transition runs can leave the React
// root view measured for the previous orientation, so the whole app is drawn in
// a corner of the rotated window. Measure the window again once a rotation has
// settled.
const relayoutMethod = `
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    val decor = window.decorView
    for (delay in longArrayOf(0L, 300L, 800L)) {
      decor.postDelayed({
        decor.requestLayout()
        decor.invalidate()
      }, delay)
    }
  }
`;

module.exports = config =>
  withMainActivity(config, activityConfig => {
    let contents = activityConfig.modResults.contents;
    if (!contents.includes('override fun onConfigurationChanged')) {
      contents = contents.replace(
        /(\n  override fun getMainComponentName\(\))/,
        `${relayoutMethod}$1`,
      );
    }
    activityConfig.modResults.contents = contents;
    return activityConfig;
  });
