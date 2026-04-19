local ADDON_NAME, ST = ...

ST.version = "1.0.0"
ST.modules = {}

function ST:RegisterModule(name, initFunc)
    self.modules[name] = initFunc
end

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:SetScript("OnEvent", function(self, event, addon)
    if addon ~= ADDON_NAME then return end

    SmileToolsDB = SmileToolsDB or {}

    ST.debugMode = SmileToolsDB.debugMode or false

    ST:InitSettings()

    for name, initFunc in pairs(ST.modules) do
        initFunc(ST)
    end

    self:UnregisterEvent("ADDON_LOADED")
end)

SLASH_SMILETOOLS1 = "/st"
SlashCmdList["SMILETOOLS"] = function(msg)
    msg = msg:lower():trim()

    if msg == "debug" then
        ST.debugMode = not ST.debugMode
        SmileToolsDB.debugMode = ST.debugMode
        if ST.debugMode then
            ST.LogInfo("Debug mode |cff00ff00enabled|r. Use /st debug to disable.")
        else
            ST.LogInfo("Debug mode |cffff0000disabled|r.")
        end
    else
        Settings.OpenToCategory(ST.settingsCategory:GetID())
    end
end
