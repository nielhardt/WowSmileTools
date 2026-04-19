local _, ST = ...

local SOULSTONE_SPELL_ID = 20707
local WARLOCK_CLASS = "WARLOCK"

local function RaidHasWarlock()
    for i = 1, GetNumGroupMembers() do
        local _, _, _, _, _, class = GetRaidRosterInfo(i)
        if class == WARLOCK_CLASS then
            return true
        end
    end
    return false
end

local function UnitHasSoulstone(unit)
    for i = 1, 40 do
        local aura = C_UnitAuras.GetAuraDataByIndex(unit, i, "HELPFUL")
        if not aura then break end
        if aura.spellId == SOULSTONE_SPELL_ID then
            local caster = aura.sourceUnit and UnitName(aura.sourceUnit) or nil
            return true, caster
        end
    end
    return false, nil
end

local function HealerHasSoulstone()
    for i = 1, GetNumGroupMembers() do
        local unit = "raid" .. i
        if UnitGroupRolesAssigned(unit) == "HEALER" and UnitHasSoulstone(unit) then
            return true
        end
    end
    return false
end

local function GetAnnounceChannel()
    local channel = SmileToolsDB.announceChannel or "RAID_WARNING"

    if channel == "NONE" then return nil end

    if channel == "RAID_WARNING" then
        if not IsInRaid() then return "PARTY" end
        if not (UnitIsGroupLeader("player") or UnitIsGroupAssistant("player")) then
            return nil
        end
    end

    return channel
end

local SOULSTONE_ICON = "|TInterface\\Icons\\spell_shadow_soulgem:0|t"

local function GetSoulstonedNames()
    local names = {}
    for i = 1, GetNumGroupMembers() do
        local unit = "raid" .. i
        local hasSS, caster = UnitHasSoulstone(unit)
        if hasSS then
            local target = UnitName(unit)
            local entry
            if caster then
                entry = "|cffaaaaaa" .. caster .. "|r " .. SOULSTONE_ICON .. " |cffaaaaaa" .. target .. "|r"
            else
                entry = SOULSTONE_ICON .. " |cffaaaaaa" .. target .. "|r"
            end
            table.insert(names, entry)
        end
    end
    return names
end

local function OnReadyCheck()
    if SmileToolsDB.soulstoneCheck == false then return end
    if not IsInRaid() then return end

    local _, instanceType = IsInInstance()
    if instanceType ~= "raid" then return end

    if not RaidHasWarlock() then return end

    local soulstoned = GetSoulstonedNames()
    if #soulstoned > 0 then
        for _, entry in ipairs(soulstoned) do
            ST.LogInfo(entry)
        end
    else
        ST.LogInfo("No one is soulstoned!")
    end

    if not HealerHasSoulstone() then
        local channel = GetAnnounceChannel()
        if channel then
            SendChatMessage("{skull}{skull} No healer is soulstoned {skull}{skull}", channel)
        else
            ST.LogInfo("No healer is soulstoned!")
        end
    end
end

ST:RegisterModule("SoulstoneCheck", function()
    local frame = CreateFrame("Frame")
    frame:RegisterEvent("READY_CHECK")
    frame:SetScript("OnEvent", function()
        OnReadyCheck()
    end)
end)
