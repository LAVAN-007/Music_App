package com.lavu.musicsyncbackend.room;

import com.lavu.musicsyncbackend.service.SongCatalog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class RoomTests {

    Room room;

    @BeforeEach
    void setUp() {
        SongCatalog catalog = new SongCatalog(JsonMapper.builder().build(), false, "", "unused.json");
        ReflectionTestUtils.invokeMethod(catalog, "start"); // loads the 8 demo songs
        room = new Room("ABC234", "Asha", catalog);
        room.join("s1", "Asha");
    }

    private static RoomCommand cmd(String type, Integer songId, Double position, Integer index, Long version) {
        return new RoomCommand(type, songId, position, index, null, version);
    }

    @Test
    void startsPausedOnTheFirstSong() {
        RoomState s = room.state();
        assertEquals(1, s.songId());
        assertFalse(s.playing());
        assertEquals(0, s.version());
    }

    @Test
    void playPauseAndSeek() {
        assertTrue(room.apply(cmd("PLAY", null, null, null, null)));
        assertTrue(room.state().playing());

        assertTrue(room.apply(cmd("SEEK", null, 42.5, null, null)));
        assertEquals(42.5, room.state().position());
        assertTrue(room.state().playing(), "seeking keeps playing");

        assertTrue(room.apply(cmd("PAUSE", null, 50.0, null, null)));
        assertFalse(room.state().playing());
        assertEquals(50.0, room.state().position());
        assertEquals(3, room.state().version());
    }

    @Test
    void selectRejectsUnknownSongs() {
        assertFalse(room.apply(cmd("SELECT", 999, null, null, null)));
        assertTrue(room.apply(cmd("SELECT", 5, null, null, null)));
        assertEquals(5, room.state().songId());
        assertTrue(room.state().playing());
    }

    @Test
    void nextUsesTheQueueThenTheLibraryAndWraps() {
        room.apply(cmd("QUEUE_ADD", 7, null, null, null));
        room.apply(cmd("QUEUE_ADD", 3, null, null, null));
        assertEquals(List.of(7, 3), room.state().queue());

        room.apply(cmd("NEXT", null, null, null, null));
        assertEquals(7, room.state().songId());
        room.apply(cmd("NEXT", null, null, null, null));
        assertEquals(3, room.state().songId());
        room.apply(cmd("NEXT", null, null, null, null));
        assertEquals(4, room.state().songId(), "queue empty: continue through the library");

        room.apply(cmd("SELECT", 8, null, null, null));
        room.apply(cmd("NEXT", null, null, null, null));
        assertEquals(1, room.state().songId(), "wraps around");
    }

    @Test
    void endedFromSeveralListenersAdvancesOnce() {
        room.join("s2", "Bala");
        room.apply(cmd("PLAY", null, null, null, null));
        long version = room.state().version();

        assertTrue(room.apply(cmd("ENDED", 1, null, null, version)));
        assertFalse(room.apply(cmd("ENDED", 1, null, null, version)), "second report is stale");
        assertEquals(2, room.state().songId());
    }

    @Test
    void aTrackOnlyEndsWhenTheRoomClockGetsThere() {
        room.apply(cmd("SELECT", 2, null, null, null));
        room.apply(cmd("PAUSE", null, 100.0, null, null));
        room.apply(cmd("PLAY", null, null, null, null));
        long version = room.state().version();

        assertFalse(room.apply(cmd("ENDED", 2, 180.0, null, version)), "a listener whose clock runs ahead cannot cut the song short");
        assertEquals(2, room.state().songId());
        assertTrue(room.apply(cmd("ENDED", 2, 100.2, null, version)), "at the end (within tolerance) the room moves on");
        assertEquals(3, room.state().songId());
    }

    @Test
    void prevGoesBackOrRestarts() {
        room.apply(cmd("SELECT", 4, null, null, null));
        room.apply(cmd("PREV", null, null, null, null));
        assertEquals(3, room.state().songId());

        room.apply(cmd("PAUSE", null, 30.0, null, null));
        room.apply(cmd("PREV", null, null, null, null));
        assertEquals(3, room.state().songId(), "more than 3s in: restart the same song");
        assertEquals(0, room.state().position());
    }

    @Test
    void newSongStartsAfterALeadSoListenersBeginTogether() {
        long before = System.currentTimeMillis();
        room.apply(cmd("SELECT", 4, null, null, null));
        RoomState started = room.state();
        assertEquals(0, started.position());
        assertTrue(started.updatedAt() >= before + Room.START_LEAD_MILLIS, "start is scheduled ahead");

        room.apply(cmd("PAUSE", null, null, null, null));
        assertEquals(0, room.state().position(), "pausing during the lead stays at 0:00");
        assertTrue(room.state().updatedAt() < before + Room.SEEK_LEAD_MILLIS, "a pause takes effect at once");

        room.apply(cmd("SEEK", null, 40.0, null, null));
        assertTrue(room.state().updatedAt() < before + Room.SEEK_LEAD_MILLIS, "so does a seek while paused");
        room.apply(cmd("PLAY", null, null, null, null));
        long seekAt = System.currentTimeMillis();
        room.apply(cmd("SEEK", null, 90.0, null, null));
        assertTrue(room.state().updatedAt() >= seekAt + Room.SEEK_LEAD_MILLIS, "a seek while playing resumes ahead");
        room.apply(cmd("PAUSE", null, null, null, null));
        assertEquals(90.0, room.state().position(), "the position holds during the lead");
    }

    @Test
    void queueEditsLeavePlaybackUntouched() {
        room.apply(cmd("SELECT", 2, null, null, null));
        room.apply(cmd("SEEK", null, 75.0, null, null));
        RoomState before = room.state();

        room.apply(cmd("QUEUE_ADD", 3, null, null, null));
        room.apply(cmd("QUEUE_ADD", 4, null, null, null));
        room.apply(cmd("QUEUE_REMOVE", null, null, 0, null));
        room.apply(cmd("QUEUE_CLEAR", null, null, null, null));
        RoomState after = room.state();

        assertEquals(before.position(), after.position());
        assertEquals(before.updatedAt(), after.updatedAt(), "the playback clock must not restart");
        assertEquals(before.playing(), after.playing());
        assertEquals(before.version() + 4, after.version(), "listeners still receive the new queue");
    }

    @Test
    void queueEditing() {
        room.apply(cmd("QUEUE_ADD", 2, null, null, null));
        room.apply(cmd("QUEUE_ADD", 3, null, null, null));
        room.apply(cmd("QUEUE_ADD", 4, null, null, null));
        assertFalse(room.apply(cmd("QUEUE_REMOVE", null, null, 9, null)));
        assertTrue(room.apply(cmd("QUEUE_REMOVE", null, null, 0, null)));
        assertEquals(List.of(3, 4), room.state().queue());

        assertTrue(room.apply(cmd("QUEUE_PLAY", null, null, 1, null)));
        assertEquals(4, room.state().songId());
        assertEquals(List.of(3), room.state().queue());

        assertTrue(room.apply(cmd("QUEUE_CLEAR", null, null, null, null)));
        assertTrue(room.state().queue().isEmpty());
    }

    @Test
    void presenceCountsPeopleNotConnections() {
        assertFalse(room.join("s1b", "Asha"), "second tab of the same user");
        assertTrue(room.join("s2", "Bala"));
        assertEquals(List.of("Asha", "Bala"), room.users());

        assertNull(room.leave("s1"), "Asha still has another tab open");
        assertEquals("Asha", room.leave("s1b"));
        assertEquals(List.of("Bala"), room.users());
    }

    @Test
    void emptyRoomCanBePausedButAnOccupiedOneCannot() {
        room.apply(cmd("PLAY", null, null, null, null));
        room.pauseIfEmptyFor(0);
        assertTrue(room.state().playing(), "someone is still listening");

        room.leave("s1");
        assertTrue(room.isEmpty());
        room.pauseIfEmptyFor(60_000);
        assertTrue(room.state().playing(), "keeps going briefly so a page reload is seamless");
        room.pauseIfEmptyFor(0);
        assertFalse(room.state().playing());
    }

    @Test
    void keepsOnlyRecentMessages() {
        for (int i = 0; i < Room.MAX_MESSAGES + 20; i++) room.addMessage("Asha", "m" + i, false);
        List<ChatMessage> messages = room.messages();
        assertEquals(Room.MAX_MESSAGES, messages.size());
        assertEquals("m20", messages.get(0).text());
    }
}
