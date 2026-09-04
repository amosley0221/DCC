/**
 * The save's team id, 0-137, to the school it means.
 *
 * Derived from the save rather than assumed: every recruit carries a top-ten
 * list of `{ teamId, influence }` pairs, and the game's own class export names
 * those schools. Matching 4,037 of 4,100 lists gives each id a name by majority
 * across hundreds of recruits, with no id disagreeing below 88% and no school
 * claimed twice.
 *
 * The order is EA's own and long-lived: 0-113 are the FBS schools in
 * alphabetical order, and 114-137 are the ones added since, appended rather
 * than merged in. That is why Air Force is 0 and Sac State is 137.
 *
 * A dynasty can rename or realign a team, so this is the default rather than
 * the truth — a name the user sets always wins.
 */
export const TEAM_ID_NAMES: (string | null)[] = [
  "Air Force", "Akron", "Alabama", "Arizona",
  "Arizona State", "Arkansas", "Arkansas State", "Army",
  "Auburn", "Ball State", "Baylor", "Boise State",
  "Boston College", "Bowling Green", "Buffalo", "BYU",
  "California", "UCF", "C. Michigan", "Cincinnati",
  "Clemson", "Colorado", "Colorado State", "Duke",
  "East Carolina", "E. Michigan", "Florida", "Florida State",
  "Fresno State", "Georgia", "Georgia Tech", "Hawai'i",
  "Houston", "Illinois", "Indiana", "Iowa",
  "Iowa State", "Kansas", "Kansas State", "Kent State",
  "Kentucky", "Louisiana Tech", "Louisville", "LSU",
  "Marshall", "Maryland", "Memphis", "Miami",
  "Miami (OH)", "Michigan", "Michigan State", "MTSU",
  "Minnesota", "Mississippi St", "Missouri", "Navy",
  "Nebraska", "Nevada", "New Mexico", "New Mexico St.",
  "North Carolina", "NC State", "North Texas", "UL Monroe",
  "NIU", "Northwestern", "Notre Dame", "Ohio",
  "Ohio State", "Oklahoma", "Oklahoma State", "Ole Miss",
  "Oregon", "Oregon State", "Penn State", "Pittsburgh",
  "Purdue", "Rice", "Rutgers", "San Diego St.",
  "San Jose State", "SMU", "South Carolina", "Southern Miss",
  "Louisiana", "Stanford", "Syracuse", "TCU",
  "Temple", "Tennessee", "Texas", "Texas A&M",
  "Texas Tech", "Toledo", "Tulane", "Tulsa",
  "UAB", "UCLA", "UConn", "UNLV",
  "USC", "Utah", "Utah State", "UTEP",
  "Vanderbilt", "Virginia", "Virginia Tech", "Wake Forest",
  "Washington", "Washington St.", "West Virginia", "W. Michigan",
  "Wisconsin", "Wyoming", "FLA Atlantic", "FIU",
  "Georgia State", "UTSA", "Old Dominion", "UMass",
  "South Alabama", "USF", "Troy", "W. Kentucky",
  "Texas State", "App St.", "Charlotte", "C. Carolina",
  "Ga Southern", "Jax State", "James Madison", "Liberty",
  "Sam Houston", "Kennesaw St.", "Delaware", "Missouri State",
  "NDSU", "Sac State",
]
