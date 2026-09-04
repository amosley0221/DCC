import { Btn, Card, Kicker, Meta, SectionHeader } from '../ui'
import { useSave } from '../saveStore'

/**
 * What a section shows when the save cannot fill it yet.
 *
 * The save itself is readable — names, positions, overalls and all 53 ratings
 * come out of it, and the Roster section shows them. What each of these
 * sections still needs is a specific piece of the format that has not been
 * decoded, so it says which piece rather than blaming the save.
 */
const BLOCKED: Record<string, { needs: string; detail: string }> = {
  Wire: {
    needs: 'the storyline objects',
    detail:
      'The generated news sits inside the save’s compressed frames. Those decode, but their ' +
      'objects have not been mapped to headlines and dates yet.',
  },
  National: {
    needs: 'records and standings',
    detail:
      'Team results are not decoded. The rating block gave up the players; the equivalent for ' +
      'teams — wins, losses, rankings — has not been located.',
  },
  Recruit: {
    needs: 'the recruiting board',
    detail:
      'Prospects, interest levels and visits are not decoded. Some of the players already read ' +
      'out of the save are recruits, but nothing marks them as such yet.',
  },
  Team: {
    needs: 'the player→team link',
    detail:
      'Every player is readable, but which school they play for is not. The team id in a ' +
      'player’s asset name is where they were generated, not where they are now, and the ' +
      'save’s own team field has resisted the same treatment that cracked the ratings.',
  },
  Tamper: {
    needs: 'writing to the save',
    detail:
      'Reading is solved; writing is not attempted. Everything so far is read-only on purpose, ' +
      'because a wrong byte in a 31 MB save is a lost dynasty.',
  },
  Coach: {
    needs: 'coach records',
    detail:
      'Coaches are in the save — their names use a different asset prefix from players — but ' +
      'their contracts, records and career history are not decoded.',
  },
}

export default function NoDynasty({ section, onOpenSettings }: {
  section: string
  onOpenSettings: () => void
}) {
  const { save } = useSave()
  const blocked = BLOCKED[section]
  const haveSave = !!save.report

  return (
    <>
      <SectionHeader
        title={section}
        sub={<Meta>{haveSave ? `NEEDS ${blocked?.needs.toUpperCase() ?? 'MORE OF THE FORMAT'}` : 'NO SAVE LOADED'}</Meta>}
      />
      <div className="col" style={{ gap: 12, maxWidth: 640 }}>
        {haveSave ? (
          <Card className="card-pad">
            <Kicker>Not decoded yet</Kicker>
            <p className="body-serif" style={{ marginTop: 7 }}>
              {blocked?.detail ??
                'This part of the save has not been mapped yet.'}
            </p>
            <p className="body-serif" style={{ marginBottom: 0 }}>
              Your save <strong>is</strong> loaded and readable — {save.roster
                ? `${save.roster.count.toLocaleString()} players, with positions, overalls and all 53 ratings, are in the Roster section.`
                : 'the Roster section will read every player out of it, with positions, overalls and all 53 ratings.'}
            </p>
          </Card>
        ) : (
          <Card className="card-pad">
            <Kicker>Waiting on your save</Kicker>
            <p className="body-serif" style={{ marginTop: 7, marginBottom: 0 }}>
              This app shows your dynasty and nothing else, so it stays empty until a save is read.
              Open <code>DYNASTY-*.sav</code> in the Save section and the Roster fills in.
            </p>
          </Card>
        )}

        <Card className="card-pad">
          <Kicker color="var(--ink3)">Sample dynasty</Kicker>
          <p className="body-serif" style={{ marginTop: 7 }}>
            Settings can load a sample dynasty to show how these screens are meant to look. It is
            invented data, not your save, and it is clearly labelled as such wherever it appears.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <Btn onClick={onOpenSettings}>Open settings</Btn>
          </div>
        </Card>
      </div>
    </>
  )
}
