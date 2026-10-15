Refactoring plan for DashSection

# AppItem
a model for an icon in dash. should be single source of truth for such things as app meta info, app icon, app state.
# WindowItem
a model for an icon in dash. should be a single source of truth for such things as window title, window's app metadata, window's monitor

# Modes
There should be two different modes with a toggle in preferences
Mode1 - perApp mode. Each Icon in dash (except Launchpad) represent an AppItem.
Mode2 - perWindow mode. Each icon in dash (except Launchpad) represents a WindowItem

# Open Windows indicators
in Mode1 each icon should have an indicators under it representing the amount of running windows with cap of 4. if 4 or more windows are opened there should be 4 indicators. if no windows are opened there should be no indicators. indicators should not affect the positioning of an icon in any way.
In Mode2 each window-backed icon should have exactly one indicator. Favorite icons with no visible running window should have no indicator. A window represented by a favorite should NOT create a separate icon.

# Sections
Section should represent the real dash with Favorite apps as well as running apps
Section should include 3 main subsections


## Subsection one
Includes single item - Launchpad. it's sole purpose is to open on overview. It's not considered a DashIcon and should not follow the rest of the rules.
Icon size 40px, icon do NOT shrink
Nothing else in this subsection
Icon click toggles overview
NO separate between this subsection and next one

## Subsection two
Favorite Apps. Should determine favorite apps from system and display them
should have a view for appItem model
should always have firefox and files as first two items even when they are not in favorite list (HARDCODED APPS)
HARDCODED APPS should not ever be unpinned, unfavorited or dragged
Should have indicators under them representing a running window count in Mode1. May have a single indicator in Mode2.
In mode2 if one window is opened no separate icon should be created if app in in favorite section. However second and later windows of such app SHOULD create a separate icons.
Section should NOT end with separator

## SubSection three
Opened Windows or running apps Subsection.
SubSection should ALWAYS start with a separator
in Mode1 Section should contain views for AppItems - representing all running items except those who already represented in Favorite subsection.
in Mode2 Section should contain views for WindowItems representing all running windows except those which already represented in Favorite subsection

# Overflow behaviour
At the begining all items should have 40px icons. if max width is reached all icons BUT Launchpad should shrink to 32px. If max width is reached again we should enter +N mode (partialy implemented). This events should happen in section independantly as the copies of this section will be on different monitors with different available width. if section on wider monitor can still be at 40px should NOT mean section on other monitor also should be 40px.

# DashIcon
Should be separate class - a view for a model (AppItem or WindowItem). on rmb click should open a context menu with basic options from desktop file and custom option to fav/unfav app. Can be DragAndDroped to change the location. Draging icon from running section to favorite subsection should add app to favorites.

You may use Dashtopanel or dashtodock extension as references of what I want
