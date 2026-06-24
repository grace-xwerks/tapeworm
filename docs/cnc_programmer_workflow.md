# CNC Programmer Workflow & Data Lifecycle Guide

This document captures the complete workflow of a CNC programmer using the Tapeworm platform—from post-processing G-code in Autodesk Fusion and inspecting it in VS Code, through ingestion and revision control, to dynamic O-number rewriting and machine tool transmission.

---

## High-Level Workflow Diagram

```mermaid
graph TD
    subgraph 1. Fusion & VS Code (Editing)
        A[Autodesk Fusion CAM Setup] -->|Post Process| B[G-code Output: customer-part.cnc]
        B --> C[VS Code Editor + G-code Syntax Extension]
    end

    subgraph 2. Ingestion & Version Control (Database)
        C -->|Ingest via VS Code Sidebar / Web UI| D[Tapeworm Library: Draft Status]
        D -->|Auto-Extract Metadata & Verify| E[O-number, Sync Labels & Subprogram refs]
        F[Lead Reviewer / Dry Run] -->|Approve| G[Approved / In Production Status]
    end

    subgraph 3. Translation & Transmission (Wire)
        G -->|Arm Machine & Send| H[Dynamic O-number Resolver]
        H -->|Atomic Rewrite| I[Rewritten G-code Bundle]
        I -->|Dispatch| J{Transfer Mode}
        J -->|rs232_serial| K[Moxa NPort Socket ➔ Machine]
        J -->|net_share| L[Network Shared Folder]
        J -->|usb_gadget| M[Pi Zero Emulator]
    end

    subgraph 4. Loop Closure (Feedback)
        K & L & M -->|Operator Tweaks at Control Panel| N[Receive Program Back]
        N -->|Extract Transmitted O-Number Header| O[Search active substitution map or global assignments]
        O -->|Identify Part/Revision| P[Record Operator Edits as New Rev]
    end
```

---

## Detailed Step-by-Step Workflow

### Step 1: CAM Generation & Post-Processing (Autodesk Fusion)
1. **CAM Development**: The programmer designs the machining operations (mill setups, turning profiles, Swiss lathe channel synchronization) within Autodesk Fusion.
2. **Post-Processing**: The toolpath is compiled into G-code (machine-specific language) via a post-processor. 
   - Files are named using human-readable patterns:
     - **Swiss Lathes**: `customer-partnumber.cnc` (e.g. `grace-88602.cnc`). Since Swiss machines are monolithic, they contain all channels (`$1`, `$2`, `$0`) in a single file and do not require separate operation suffixes.
     - **Milling Centers**: `customer-part-op10.cnc`, `customer-part-op20.cnc`, etc., to distinguish between multiple setups on the same part.
3. **VS Code Inspection**: The programmer opens the posted G-code in VS Code using a third-party G-code extension (such as "G-Code" or "CNC G-code") for syntax highlighting. (Note: The Autodesk HSM Post Processor Utility is used strictly for editing/developing the post-processors themselves, rather than viewing G-code).

### Step 2: Library Ingestion & Interface
Programmers upload G-code into Tapeworm using two primary interfaces:
1. **Web Dashboard Ingestion**:
   - The programmer navigates to the Tapeworm Cockpit dashboard.
   - Clicks **Ingest Program** and uploads the `.cnc` file or pastes the G-code text directly into the form.
   - The form displays real-time auto-parsed G-code metadata (original O-number, channel count, and detected subprogram references).
2. **VS Code Extension Integration**:
   - A dedicated Tapeworm sidebar extension allows the programmer to ingest the active editor file directly.
   - A command like `Tapeworm: Ingest Active File` triggers a quick-pick menu where the programmer selects the Customer and Part Number.
   - The extension takes care of reading the editor text, uploading it to Supabase Storage, and inserting the database records automatically.

#### Static G-code Parsing & Swiss Lathe Multi-Channels
During ingestion, Tapeworm parses the G-code file:
- **Header O-number**: Extracts the declared program number from the header (e.g. `O1001` or `:1001`).
- **Subprogram Calls**: Resolves subprogram calls (`M98 Pxxxx` or `G65 Pxxxx`), logging them as dependencies in the `program_dependencies` table to construct a dependency graph.
- **Citizen Swiss Lathe Multi-Channels**:
  - **Single Monolithic File**: Citizen Swiss lathe files contain all channels (`$1` main spindle, `$2` subspindle, `$0` barfeed parameters) inside a **single monolithic file**. The CNC machine control handles splitting the file into `$1` and `$2` execution threads at runtime.
  - **Why Tapeworm Parses Channels**: Although the file is transmitted as a single monolithic block, Tapeworm parses the channels during ingestion for **sync-point validation** (e.g. verifying that channel synchronization labels like `!L100` match between `$1` and `$2` to prevent wait-state hang crashes) and to identify subprogram calls (`M98`) located inside specific channel execution blocks.

### Step 3: Dynamic O-Number Translation & Sending
CNCs have restricted memory namespaces (usually only four-digit numbers from `1` to `9999`). Programmers cannot organize files on the machine using names like `grace-88602-rev2.cnc`. Tapeworm resolves this mismatch dynamically at the moment of transmission:
1. **Select Target Machine**: The programmer selects the machine (e.g. Citizen L20 VIII #886) and hits "Send".
2. **Resolve Dependencies**: The resolver walks the dependency graph to find all subprograms referenced by the main file.
3. **Assign O-Numbers**: For each program in the bundle, Tapeworm looks up if it has a permanent `machine_program_assignments` record for this machine:
   - If an assignment exists, it reuses that `o_number`.
   - If no assignment exists, it automatically claims the first available O-number in the machine's namespace (preferring `1001-7999` to avoid system macros).
4. **Atomic Rewrite**: Tapeworm rewrites the G-code text in memory:
   - Swaps the root program header `Oxxxx` to `O[assigned]`.
   - Swaps all subprogram calls `M98 Pxxxx` / `G65 Pxxxx` to point to the children's assigned O-numbers.
5. **Wire Transmission**: The processed bundle is dispatched to the machine's configured port/path:
   - **RS-232**: Opened as a TCP socket connection to a port on a `Moxa NPort` server, streaming the G-code with hardware/software handshakes.
   - **Network Share**: Copied to a UNC directory monitored by the CNC controller.
   - **USB Gadget**: Secure-copied (SCP) to a Raspberry Pi Zero acting as a USB mass storage device plugged into the machine's USB port.

### Step 4: Loop Closure (Determining O-numbers on Receive-Back)
When operators make edits at the machine panel (e.g., feed rate adjustments, offset tweaks), they transmit the program back from the machine control. The incoming stream only contains the machine-assigned O-number (e.g., `O3412`), not the human-readable part name. Tapeworm resolves this via a multi-tiered lookup:
1. **Header Parsing**: The transfer agent intercepts the incoming stream and parses the first few lines to extract the transmitted O-number header (e.g., `3412`).
2. **Lookup Tier 1: Active Transfer Map**:
   - Tapeworm checks for any active or recently completed transfers on that specific `machine_id`.
   - It compares the received O-number against the `substitution_map` stored in those transfer records. If a match is found, it maps the stream back to the correct `program_id` and `revision_id`.
3. **Lookup Tier 2: Global Machine Assignments**:
   - If no active transfer matches, Tapeworm queries the `machine_program_assignments` table for that `machine_id` and `o_number`.
   - Because O-numbers are unique *within* each machine's namespace, this global search returns a single, deterministic match to the corresponding `program_id`.
4. **Diffing & Revision Control**:
   - Once matched, the received G-code is diffed against the master version.
   - The changes are highlighted for the programmer, who can approve the operator's changes and save them as a new versioned revision.

---

## Customer Ownership & Data Integrity

CNC programs are the core intellectual property (IP) of the machine shop. Furthermore, contract manufacturing agreements often dictate that the finalized, proven programs belong to the customer.

- **Customer-Specific Storage**: The `customer_id` is a primary field in the `programs` table. File storage paths on Supabase include the customer slug (e.g. `grace/GR-88602-SHAFT.cnc`), facilitating clean multi-tenant separation and easy exports if a customer requests their complete program library.
- **Cryptographic Provenance**: Every program revision stores a SHA-256 hash. If a customer audits the programs or asks for verification of the exact code run during production, the immutable `transfers` audit trail provides cryptographic proof of the code state and timestamps.
