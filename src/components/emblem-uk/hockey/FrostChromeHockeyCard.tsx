import styles from './FrostChromeHockeyCard.module.css';
import type { HockeyFrostChromeStats, HockeyPosition } from '@/lib/hockey-frost-chrome-pack';

type FrostChromeHockeyCardProps = {
  side?: 'front' | 'back';
  size?: number;
  name?: string;
  number?: string;
  team?: string;
  position?: HockeyPosition;
  stats?: Partial<HockeyFrostChromeStats>;
  photoUrl?: string | null;
  badgeUrl?: string | null;
  season?: string;
  className?: string;
};

const defaultStats = {
  gp: '32',
  g: '14',
  a: '18',
  pts: '32',
};

function statValue(stats: Partial<HockeyFrostChromeStats> | undefined, key: keyof HockeyFrostChromeStats) {
  return stats?.[key] || defaultStats[key] || '-';
}

function Crest({ badgeUrl, large = false }: { badgeUrl?: string | null; large?: boolean }) {
  return (
    <div className={`${styles.crest} ${large ? styles.crestLarge : ''}`}>
      {badgeUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={badgeUrl} alt="" />
      ) : (
        <span className={styles.star} />
      )}
    </div>
  );
}

function PlayerSilhouette() {
  return (
    <div className={styles.playerSilhouette} aria-hidden="true">
      <div className={styles.helmet} />
      <div className={styles.body} />
      <div className={styles.stick} />
    </div>
  );
}

export default function FrostChromeHockeyCard({
  side = 'front',
  size = 320,
  name = 'Avery Stone',
  number = '27',
  team = 'North Ice',
  position = 'C',
  stats,
  photoUrl,
  badgeUrl,
  season = '2026/27',
  className = '',
}: FrostChromeHockeyCardProps) {
  const cardStyle = { width: size } as const;

  if (side === 'back') {
    return (
      <article className={`${styles.card} ${styles.back} ${className}`} style={cardStyle} aria-label={`${name} Frost Chrome card back`}>
        <div className={styles.iceEdge} />
        <header className={styles.backHeader}>
          <span>{name}</span>
          <strong>{number}</strong>
        </header>
        <div className={styles.backGrid}>
          <section className={styles.crestPanel} aria-label="Team identity">
            <Crest badgeUrl={badgeUrl} large />
            <p>{team}</p>
            <small>{season}</small>
          </section>
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>Season</th>
                <th>GP</th>
                <th>G</th>
                <th>A</th>
                <th>PTS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{season}</td>
                <td>{statValue(stats, 'gp')}</td>
                <td>{statValue(stats, 'g')}</td>
                <td>{statValue(stats, 'a')}</td>
                <td>{statValue(stats, 'pts')}</td>
              </tr>
              <tr>
                <td>Cup</td>
                <td>7</td>
                <td>4</td>
                <td>3</td>
                <td>7</td>
              </tr>
            </tbody>
          </table>
        </div>
        <section className={styles.rinkPanel}>
          <span />
          <p>Quick hands, sharp edges, and a calm final pass through the middle.</p>
        </section>
        <footer className={styles.backFooter}>
          <div>NFC</div>
          <div className={styles.qr} aria-label="QR placeholder" />
          <div>TEAM</div>
        </footer>
      </article>
    );
  }

  return (
    <article className={`${styles.card} ${styles.front} ${className}`} style={cardStyle} aria-label={`${name} Frost Chrome card front`}>
      <div className={styles.iceEdge} />
      <div className={styles.topLockup}>
        <span>Frost</span>
        <strong>Chrome</strong>
      </div>
      <div className={styles.photoWindow}>
        <div className={styles.rinkLines} />
        <div className={styles.speedLines} />
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.playerPhoto} src={photoUrl} alt="" />
        ) : (
          <PlayerSilhouette />
        )}
      </div>
      <div className={styles.numberBlock}>{number}</div>
      <div className={styles.positionChip}>{position}</div>
      <div className={styles.nameplate}>
        <span>{name}</span>
        <small>{team}</small>
      </div>
      <Crest badgeUrl={badgeUrl} />
      <dl className={styles.statsRow}>
        <div>
          <dt>GP</dt>
          <dd>{statValue(stats, 'gp')}</dd>
        </div>
        <div>
          <dt>G</dt>
          <dd>{statValue(stats, 'g')}</dd>
        </div>
        <div>
          <dt>A</dt>
          <dd>{statValue(stats, 'a')}</dd>
        </div>
      </dl>
    </article>
  );
}

