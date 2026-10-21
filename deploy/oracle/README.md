# Olympus server on Oracle Cloud (free)

This puts the Olympus server on an Oracle Cloud *Always Free* virtual machine, which stays on
around the clock and costs nothing. When it is done, the Android app joins it on its own: Home
offers **Create profile** and **Sign in**, with no address or pairing code to type.

What you do takes about 15 minutes in the browser. The VM then sets itself up on its first boot
(`setup.sh`, 15 to 30 minutes on the small free machine, because it builds the app).

## 1. Create the Oracle Cloud account

1. Go to <https://www.oracle.com/cloud/free/> and choose **Start for free**.
2. Oracle asks for a card to verify you are a person. Always Free resources are not charged;
   the account stays on the free tier unless you choose **Upgrade** yourself.
3. Pick a **home region** close to you (for example *Italy Northwest (Milan)* or *Germany Central
   (Frankfurt)*). It cannot be changed later, and the free VM must be in it.

## 2. Create the VM

In the console: **☰ → Compute → Instances → Create instance**.

| Setting | Choose |
|---|---|
| Name | `olympus` |
| Image | **Canonical Ubuntu 24.04** (*Change image → Ubuntu*) |
| Shape | **VM.Standard.A1.Flex** with 1 OCPU and 6 GB if it is offered; otherwise **VM.Standard.E2.1.Micro**. Both are marked *Always Free-eligible*. |
| Networking | *Create new virtual cloud network* and *Create new public subnet*; **Assign a public IPv4 address: yes** |
| SSH keys | *Generate a key pair for me*, then **Save private key** (only needed if something goes wrong) |

Then open **Show advanced options → Management → Initialization script**, choose **Paste cloud-init
script**, and paste the whole content of [`setup.sh`](setup.sh). Press **Create**.

If Oracle answers *Out of capacity* for the A1 shape, choose the E2.1.Micro shape instead; it
is enough for a group of friends.

## 3. Open the web ports

The VM is created with only SSH allowed in. On the instance page:

1. Under **Primary VNIC**, open the **Subnet** link, then the **Default Security List**.
2. **Add Ingress Rules**: Source CIDR `0.0.0.0/0`, IP protocol **TCP**, Destination port range
   `80,443`. Save.

## 4. Check it, and create your profile first

Copy the instance's **Public IP address** (for example `141.147.12.34`). The server's address is
the IP with dashes and `.sslip.io`: `https://141-147-12-34.sslip.io`. That name needs no account and
no domain; it points at your IP and gets a real HTTPS certificate.

After 15 to 30 minutes, open that address in a browser. When the Olympus page appears, **create your
own profile first**: the first profile on a new server becomes its admin (*Settings → Admin
dashboard*: users, invite codes, disabling accounts).

Then send the public IP (or the address) to Claude, or put it into the app yourself:
GitHub → your repository → **Settings → Secrets and variables → Actions → Variables → New
repository variable**, name `OLYMPUS_SERVER`, value `https://141-147-12-34.sslip.io`. The next APK
build has it built in.

## Afterwards

- **Updates.** Every night at 03:40 the VM fetches the repository and rebuilds if anything changed
  (`/usr/local/bin/olympus-update`, log in `/var/log/olympus-update.log`).
- **Backups.** Everything (accounts, workouts, posts, photos) is in `/opt/olympus/data`. Oracle's
  free tier includes boot volume backups (*Instance → Boot volume → Backups*), or copy the folder:
  `sudo tar czf olympus-data-$(date +%F).tgz -C /opt/olympus data`.
- **Your own domain** instead of sslip.io: point its DNS at the IP, then on the VM set
  `RP_ID`, `ORIGIN` and `OLYMPUS_HOST` in `/opt/olympus/.env` and run
  `cd /opt/olympus && sudo docker compose -f docker-compose.yml -f deploy/oracle/compose.https.yml up -d`.
  Passkeys made under the old name stop working (passwords keep working).
- **Signup** is open: anyone who has the app can create a profile. To restrict it, set
  `INVITE_ONLY=1` in `/opt/olympus/.env`, restart as above, and hand out codes from the admin
  dashboard.
- **Something wrong?** Connect with the saved key (`ssh -i key.pem ubuntu@<ip>`) and read
  `/var/log/olympus-setup.log`; `sudo docker compose -f docker-compose.yml -f deploy/oracle/compose.https.yml ps`
  in `/opt/olympus` shows the containers.

The source of what this server runs is public in the repository, which is what the AGPL licence
asks of a modified version offered over a network.
