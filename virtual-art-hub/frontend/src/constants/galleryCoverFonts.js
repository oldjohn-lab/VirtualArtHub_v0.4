/**
 * 展厅封面自定义海报可选字体。
 * - value：须与 CSS font-family / 系统注册名一致，且仅含 ASCII（与后端 safeFont 一致）。
 * - label：下拉展示用，可为中文。
 * - Google Fonts 需在 App.css 中 @import 预加载（见文件顶部注释）。
 */

/** @type {{ value: string; label: string }[]} */
export const galleryCoverFontOptions = [
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Lora', label: 'Lora' },
  // 中文常见系统字体（Windows / macOS 等，依系统是否安装而定）
  { value: 'Microsoft YaHei', label: '微软雅黑' },
  { value: 'SimSun', label: '宋体 (SimSun)' },
  { value: 'SimHei', label: '黑体 (SimHei)' },
  { value: 'FangSong', label: '仿宋' },
  { value: 'KaiTi', label: '楷体' },
  { value: 'LiSu', label: '隶书' },
  { value: 'YouYuan', label: '幼圆' },
  { value: 'Microsoft JhengHei', label: '微软正黑体' },
  { value: 'PMingLiU', label: '新细明体 (PMingLiU)' },
  { value: 'PingFang SC', label: '苹方 (PingFang SC)' },
  { value: 'Songti SC', label: '宋体-简 (Songti SC)' },
  { value: 'Heiti SC', label: '黑体-简 (Heiti SC)' },
  { value: 'STSong', label: '华文宋体' },
  { value: 'STKaiti', label: '华文楷体' },
  { value: 'STHeiti', label: '华文黑体' },
  { value: 'STFangsong', label: '华文仿宋' },
  { value: 'Hiragino Sans GB', label: '冬青黑体 (Hiragino Sans GB)' },
  // 中文（Google Fonts）
  { value: 'Noto Sans SC', label: '思源黑体 (Noto Sans SC)' },
  { value: 'Noto Serif SC', label: '思源宋体 (Noto Serif SC)' },
  { value: 'ZCOOL XiaoWei', label: '站酷小薇' },
  { value: 'ZCOOL QingKe HuangYou', label: '站酷庆科黄油体' },
  { value: 'Ma Shan Zheng', label: '马善政毛笔 (Ma Shan Zheng)' },
  { value: 'Long Cang', label: '龙藏体 (Long Cang)' },
  // 拉丁衬线
  { value: 'Cormorant Garamond', label: 'Cormorant Garamond' },
  { value: 'DM Serif Display', label: 'DM Serif Display' },
  { value: 'EB Garamond', label: 'EB Garamond' },
  { value: 'Fraunces', label: 'Fraunces' },
  { value: 'Libre Baskerville', label: 'Libre Baskerville' },
  { value: 'Merriweather', label: 'Merriweather' },
  { value: 'Spectral', label: 'Spectral' },
  // 拉丁无衬线
  { value: 'Inter', label: 'Inter' },
  { value: 'Montserrat', label: 'Montserrat' },
  { value: 'Nunito', label: 'Nunito' },
  { value: 'Open Sans', label: 'Open Sans' },
  { value: 'Oswald', label: 'Oswald' },
  { value: 'Poppins', label: 'Poppins' },
  { value: 'Raleway', label: 'Raleway' },
  { value: 'Roboto', label: 'Roboto' },
  { value: 'Source Sans 3', label: 'Source Sans 3' },
  { value: 'Work Sans', label: 'Work Sans' },
  // 常见西文系统字体
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
];
