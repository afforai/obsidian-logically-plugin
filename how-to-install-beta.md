# How to Install Logically's AI Research Assistant Plugin in Obsidian

## 1. Requirements For Installing The Plugin

To install the plugin, you must have each of the following:

* Have Obsidian installed

* Install BRAT plugin, **or** download the latest plugin release from <https://github.com/afforai/obsidian-logically-plugin/releases/latest> (obsidian-logically-plugin-0.4.0.zip for example, for release 0.4.0)

## 2. Installing The Plugin

There are two ways to install the plugin:

### **If You Installed BRAT:**

1. **In Obsidian,** open Settings → Community Plugins → Browse → search for "BRAT" → Install and Enable.

2. **Open** BRAT settings → Add Beta Plugin → paste: <https://github.com/afforai/obsidian-logically-plugin>

3. **Click Add Plugin**. BRAT will download and install the latest release.

**If You Downloaded the Zip File, Not BRAT**

1. Inside obsidian, open your plugin folder
<img width="4320" height="2349" alt="image" src="https://github.com/user-attachments/assets/6b28a0f0-921d-440a-81f1-be07a1de4883" />

2) Move the downloaded plugin, which will appear as a zip file, into the folder, then select "Extract here". Ensure it extracts into a folder called "obsidian-logically-plugin". Inside, you'll see 3 files - `main.js`, `manifest.json` and `style.css`.

3. Go back to Obsidian, click the refresh button next to the open folder button, and you should see the plugin. Simply enabled it, and we're ready for step 3

## 3. Log in

All of the steps below assume that you **already have a Logically account.**

* If your login method is email and password, simply enter your email and password.

* If your login method is Google, Microsoft, or Okta, you can either:

  1. temporarily change your account settings to login via password, login into the plugin, then change back afterward.
  
     **OR**
  
  2. Get your `jwt_token` from Logically using the following steps:
  
* Login to your account → press F12 → navigate to "`Application` tab" → find the `Local storage` under `Storage` section → copy the `jwt_token` value.

  <img width="4320" height="2349" alt="image" src="https://github.com/user-attachments/assets/bbcc44c4-a7bb-4708-b53c-ee33a2500f6c" />
  
  Once you've copied your `jwt_token`, go to Obsidian settings → Logically plugin settings → paste your token into the token box → click Login.
  
  <img width="4320" height="2349" alt="image" src="https://github.com/user-attachments/assets/3a05d2ff-4219-4ec3-9d47-83f69c3afcb1" />
