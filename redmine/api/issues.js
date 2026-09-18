// /api/issues.js
// Redmine에 직접 접속하지 않고, 사내망 PC가 GitHub에 올려둔 최신 데이터 파일을 읽어옵니다.
// (Vercel은 외부 클라우드라서 사내망 전용인 Redmine에 직접 접속할 수 없기 때문)
//
// ── 스쿼드 지원 ──────────────────────────────────────────────
// 스쿼드는 데이터 파일 하나에 대응하며, 스쿼드 id 가 곧 파일명입니다.
//   /api/issues?squad=275677   →  data/275677.json    (상위 일감번호 기준 하위 일감)
//   /api/issues?squad=saas802  →  data/saas802.json   (제목 prefix 기준 목록)
//   /api/issues                →  data/latest.json    (하위호환)
//
// 스쿼드가 늘어나도 이 파일은 수정할 필요가 없습니다.
// 사내망 PC의 relay 스크립트가 data/<id>.json 을 올려주고,
// index.html 상단의 SQUADS 배열에 한 줄만 추가하면 됩니다.
// ─────────────────────────────────────────────────────────────

// 실제 값으로 수정해주세요 (relay_to_github.py와 동일한 저장소/경로여야 합니다)
const GITHUB_OWNER = 'UntitledRST';
const GITHUB_REPO = 'V';
const GITHUB_BRANCH = 'main';
const GITHUB_DATA_DIR = 'data';

const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${GITHUB_DATA_DIR}`;

// 경로 조작(../, 슬래시, 점 등)을 막기 위해 영문/숫자/밑줄/하이픈만 허용합니다.
// 숫자만으로 된 상위 일감번호(275677)와 이름 형태의 id(saas802) 둘 다 이 규칙을 통과합니다.
const SQUAD_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function resolveFileName(squad) {
  if (squad == null || squad === '') return 'latest.json';
  const id = String(squad).trim();
  if (!SQUAD_ID_PATTERN.test(id)) return null;
  return `${id}.json`;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const squad = (req.query && req.query.squad) || '';
  const fileName = resolveFileName(squad);

  if (!fileName) {
    return res.status(400).json({
      ok: false,
      error: `올바르지 않은 스쿼드 값입니다: "${squad}" (영문/숫자/밑줄/하이픈만 사용할 수 있습니다)`,
    });
  }

  try {
    // raw.githubusercontent.com은 CDN 캐시가 있을 수 있어, 매번 다른 쿼리스트링을 붙여 캐시를 우회함
    const url = `${RAW_BASE}/${fileName}?t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (response.status === 404) {
      throw new Error(
        `${GITHUB_DATA_DIR}/${fileName} 파일이 아직 없습니다. ` +
        `사내망 PC의 릴레이 스크립트가 이 항목(${squad || 'latest'})을 수집 대상에 포함하고 있는지 확인해주세요.` +
        (fileName === 'latest.json' ? ' (relay_to_github.py의 UPLOAD_LEGACY_LATEST가 True인지 확인)' : '')
      );
    }
    if (!response.ok) {
      throw new Error(
        `GitHub에서 데이터 파일을 가져오지 못함 (HTTP ${response.status}). 저장소/브랜치 설정을 확인해주세요.`
      );
    }

    const data = await response.json();

    // 어느 스쿼드 데이터인지 프론트가 알 수 있도록 표시해서 함께 내려줌
    res.status(200).json({ ...data, squad: squad || null, source: `${GITHUB_DATA_DIR}/${fileName}` });
  } catch (err) {
    // 프론트가 data.ok를 보고 에러 메시지를 그대로 표시하므로 200으로 내려줍니다.
    res.status(200).json({
      ok: false,
      error: String((err && err.message) || err),
    });
  }
};
