import { getAppDb } from '../db/app-db';

export interface DMNote {
  id: number;
  player_uuid: string;
  character_name: string;
  note: string;
  author_discord_id: string;
  author_username: string;
  created_at: string;
}

export function getNotesForPlayer(uuid: string): DMNote[] {
  return getAppDb()
    .prepare('SELECT * FROM dm_notes WHERE player_uuid = ? ORDER BY created_at DESC')
    .all(uuid) as DMNote[];
}

export function addNote(
  uuid: string,
  characterName: string,
  note: string,
  authorDiscordId: string,
  authorUsername: string
): DMNote {
  const db = getAppDb();
  const result = db.prepare(
    'INSERT INTO dm_notes (player_uuid, character_name, note, author_discord_id, author_username) VALUES (?, ?, ?, ?, ?)'
  ).run(uuid, characterName, note, authorDiscordId, authorUsername);

  return db.prepare('SELECT * FROM dm_notes WHERE id = ?').get(result.lastInsertRowid) as DMNote;
}

export function deleteNote(id: number, authorDiscordId: string, isAdmin: boolean): boolean {
  const db = getAppDb();
  // Only the author or an admin can delete a note
  if (isAdmin) {
    return db.prepare('DELETE FROM dm_notes WHERE id = ?').run(id).changes > 0;
  }
  return db.prepare('DELETE FROM dm_notes WHERE id = ? AND author_discord_id = ?').run(id, authorDiscordId).changes > 0;
}
