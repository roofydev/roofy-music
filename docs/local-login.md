# Local Login And User Accounts

Roofy Music starts a local Navidrome server on `http://127.0.0.1:4533`.

The default generated admin login for this machine is:

```txt
Username: admin
Password: <generated locally>
Server:   http://127.0.0.1:4533
```

For development runs using the `Roofy Music-dev` Electron profile, the current generated admin login is:

```txt
Username: admin
Password: <generated locally>
Server:   http://127.0.0.1:4533
```

These passwords are generated per local app profile. If the app profile is deleted, a new password will be generated.

The packaged app stores the generated password in:

```txt
%APPDATA%\Roofy Music\config.json
```

The development app stores it in:

```txt
%APPDATA%\Roofy Music-dev\config.json
```

The config key is:

```txt
roofy.navidromePassword
```

The `Roofy Local` page in the desktop app also shows the active server URL, username, password, and config path.

## Creating A New User

Open `Roofy Local` in the desktop app and use the `Create local user` form. It creates a user in the bundled local Navidrome engine through the local admin account.

Non-admin users are for normal playback/library access. Admin users can manage server settings and other users.

