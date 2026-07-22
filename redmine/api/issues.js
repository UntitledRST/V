// /api/issues.js
// 이제 Redmine에 직접 접속하지 않고, 사내망 PC가 GitHub에 올려둔 최신 데이터 파일을 읽어옵니다.
// (Vercel은 외부 클라우드라서 사내망 전용인 Redmine에 직접 접속할 수 없기 때문)

// 실제 값으로 수정해주세요 (relay_to_github.py와 동일한 저장소/경로여야 합니다)
const GITHUB_OWNER = 'UntitledRST';
const GITHUB_REPO = 'V';
const GITHUB_BRANCH = 'main';
const GITHUB_FILE_PATH = 'data/latest.json';

const RAW_URL = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_FILE_PATH}`;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // raw.githubusercontent.com은 CDN 캐시가 있을 수 있어, 매번 다른 쿼리스트링을 붙여 캐시를 우회함
    const url = `${RAW_URL}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`GitHub에서 데이터 파일을 가져오지 못함 (HTTP ${response.status}). data/latest.json이 아직 생성 전이거나 저장소 설정을 확인해주세요.`);
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: String((err && err.message) || err),
    });
  }
};
