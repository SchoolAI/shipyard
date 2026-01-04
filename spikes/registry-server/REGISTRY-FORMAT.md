# Registry File Format

The registry file is stored at `~/.peer-plan/servers.json` and contains a list of active WebSocket servers.

## Location

```
~/.peer-plan/servers.json
```

## Format

```json
{
  "servers": [
    {
      "port": 3100,
      "url": "ws://localhost:3100",
      "pid": 12345,
      "startedAt": "2026-01-03T17:30:00.000Z"
    },
    {
      "port": 3101,
      "url": "ws://localhost:3101",
      "pid": 12346,
      "startedAt": "2026-01-03T17:30:01.000Z"
    }
  ]
}
```

## Fields

| Field | Type | Description |
|-------|------|-------------|
| `port` | number | WebSocket server port number |
| `url` | string | Full WebSocket URL (e.g., `ws://localhost:3100`) |
| `pid` | number | Process ID of the server |
| `startedAt` | string | ISO 8601 timestamp of when server started |

## Lifecycle

### Server Startup
1. Server starts on a given port
2. Server reads existing registry file (or creates empty structure)
3. Server removes any existing entry for its port
4. Server adds new entry with current timestamp and PID
5. Server writes registry back to file

### Server Shutdown
1. Server receives SIGINT/SIGTERM
2. Server closes all connections
3. Server reads registry file
4. Server removes its entry by port
5. Server writes registry back to file

### Registry Server
- Reads registry file on each HTTP request to `/registry`
- Returns JSON array of servers
- Does not modify the file
- Returns empty array if file doesn't exist

## Example Empty Registry

```json
{
  "servers": []
}
```

## Example with Multiple Servers

```json
{
  "servers": [
    {
      "port": 3100,
      "url": "ws://localhost:3100",
      "pid": 12345,
      "startedAt": "2026-01-03T17:30:00.000Z"
    },
    {
      "port": 3101,
      "url": "ws://localhost:3101",
      "pid": 12346,
      "startedAt": "2026-01-03T17:30:01.000Z"
    },
    {
      "port": 3102,
      "url": "ws://localhost:3102",
      "pid": 12347,
      "startedAt": "2026-01-03T17:30:02.000Z"
    }
  ]
}
```

## Notes

- File is created automatically in `~/.peer-plan/` if directory doesn't exist
- Each server manages its own entry (add on start, remove on stop)
- Registry server only reads the file, never writes
- Browser fetches registry via HTTP GET from registry server
- File-based approach is simple and doesn't require database

## Future Enhancements

Potential improvements not included in this spike:

- Health checks to detect stale entries (servers that crashed)
- Timestamps for last seen/heartbeat
- Server metadata (name, capabilities, version)
- Expiration/TTL for entries
- File locking for concurrent writes
- Watch mode for registry server to push updates to browsers
