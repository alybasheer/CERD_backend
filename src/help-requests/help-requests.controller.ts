import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UploadedFiles,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RateHelpRequestDto } from '../ratings/dto/rate-help-request.dto';
import { RatingsService } from '../ratings/ratings.service';
import { CreateHelpRequestDto } from './dto/create-help-request.dto';
import { CreateSosRequestDto } from './dto/create-sos-request.dto';
import { HelpRequestMediaService } from './help-request-media.service';
import { HelpRequestsService } from './help-requests.service';

@Controller('help-requests')
@UseGuards(JwtAuthGuard)
export class HelpRequestsController {
    constructor(
        private readonly helpRequestsService: HelpRequestsService,
        private readonly mediaService: HelpRequestMediaService,
        private readonly ratingsService: RatingsService,
    ) {}

    // ──────────────────────────────────────────────
    // POST /help-requests
    // Create a new help request
    // ──────────────────────────────────────────────

    @Post('media')
    @UseInterceptors(
        FilesInterceptor('files', 2, {
            limits: { files: 2, fileSize: 5 * 1024 * 1024 },
        }),
    )
    async uploadMedia(@UploadedFiles() files: any[], @Req() req: any) {
        const mediaUrls = await this.mediaService.upload(
            files,
            this.resolveBaseUrl(req),
        );

        return {
            success: true,
            message: 'Request photos uploaded',
            data: { mediaUrls },
        };
    }

    @Post()
    async create(@Req() req: any, @Body() dto: CreateHelpRequestDto) {
        const userId = req.user.sub;

        const { request, nearbyVolunteers, nearbyOnlineVolunteers, notified } =
            await this.helpRequestsService.createRequest(userId, dto);

        return {
            success: true,
            message: `Help request created. ${nearbyOnlineVolunteers.length} active nearby volunteer(s) found.`,
            data: {
                request,
                nearbyVolunteerCount: nearbyVolunteers.length,
                nearbyOnlineVolunteerCount: nearbyOnlineVolunteers.length,
                nearbyVolunteers,
                nearbyOnlineVolunteers,
                notified,
            },
        };
    }

    @Post('sos')
    async createSos(@Req() req: any, @Body() dto: CreateSosRequestDto) {
        const result = await this.helpRequestsService.createSosRequest(req.user.sub, dto);

        return {
            success: true,
            message: result.alreadyActive
                ? 'You already have an active SOS'
                : `SOS sent to ${result.notified} active nearby volunteer(s)`,
            data: {
                request: result.request,
                alreadyActive: result.alreadyActive,
                notified: result.notified,
                nearbyOnlineVolunteers: result.nearbyOnlineVolunteers,
            },
        };
    }

    @Post('sos/cancel')
    async cancelSos(@Req() req: any) {
        const request = await this.helpRequestsService.cancelSos(req.user.sub);

        return {
            success: true,
            message: 'SOS cancelled',
            data: { request },
        };
    }

    // ──────────────────────────────────────────────
    // GET /help-requests
    // List open requests — optionally filter by proximity
    // Query: ?lat=31.5&lng=74.3&radius=10
    // ──────────────────────────────────────────────

    @Get()
    async findAll(
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
        @Query('radius') radius?: string,
    ) {
        // If lat/lng provided, return nearby open requests
        if (lat && lng) {
            const latitude = parseFloat(lat);
            const longitude = parseFloat(lng);
            const radiusKm = radius ? parseFloat(radius) : 10;

            if (isNaN(latitude) || isNaN(longitude)) {
                throw new BadRequestException('lat and lng must be valid numbers');
            }

            const requests = await this.helpRequestsService.getNearbyOpenRequests(
                longitude,
                latitude,
                radiusKm,
            );

            return {
                success: true,
                message: `Found ${requests.length} open request(s) within ${radiusKm}km`,
                data: requests,
            };
        }

        // Otherwise return all open requests
        const requests = await this.helpRequestsService.getAllOpenRequests();
        return {
            success: true,
            message: `Found ${requests.length} open request(s)`,
            data: requests,
        };
    }

    // ──────────────────────────────────────────────
    // GET /help-requests/my
    // My posted requests (any status)
    // ──────────────────────────────────────────────

    @Get('nearby-volunteers')
    async nearbyVolunteers(
        @Query('lat') lat: string,
        @Query('lng') lng: string,
        @Query('radius') radius?: string,
        @Query('onlineOnly') onlineOnly?: string,
    ) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);
        const radiusKm = radius ? parseFloat(radius) : 10;

        if (isNaN(latitude) || isNaN(longitude)) {
            throw new BadRequestException('lat and lng must be valid numbers');
        }

        const volunteers = await this.helpRequestsService.findNearbyVolunteers(
            longitude,
            latitude,
            radiusKm,
            undefined,
            onlineOnly !== 'false',
        );

        return {
            success: true,
            message: `Found ${volunteers.length} nearby volunteer(s)`,
            data: volunteers,
        };
    }

    @Get('my/active')
    async myActiveRequests(@Req() req: any) {
        const requests = await this.helpRequestsService.getMyActiveRequests(req.user.sub);
        return {
            success: true,
            data: requests,
        };
    }

    @Get('my')
    async myRequests(@Req() req: any) {
        const userId = req.user.sub;
        const requests = await this.helpRequestsService.getMyRequests(userId);
        return {
            success: true,
            data: requests,
        };
    }

    @Get('my/accepted-history')
    async myAcceptedHistory(@Req() req: any) {
        const requests = await this.helpRequestsService.getVolunteerAcceptedHistory(req.user.sub);
        return { success: true, data: requests };
    }

    @Get('my/stats')
    async myStats(@Req() req: any) {
        const userId = req.user.sub;
        const role = req.user.role;

        const totalHelped = role === 'volunteer' || role === 'admin'
            ? await this.helpRequestsService.getVolunteerCompletedRequestsCount(userId)
            : 0;

        const stats = await this.ratingsService.getVolunteerStats(userId);
        const ratings = await this.ratingsService.getVolunteerRatings(userId);

        return {
            success: true,
            data: {
                totalHelped,
                ratingAverage: stats.ratingAverage,
                ratingCount: stats.ratingCount,
                ratings,
            },
        };
    }

    // ──────────────────────────────────────────────
    // GET /help-requests/:id
    // Single request details
    // ──────────────────────────────────────────────

    @Get('media/:id')
    async getMedia(@Param('id') id: string, @Res() res: Response) {
        const media = await this.mediaService.openDownloadStream(id);

        res.setHeader('Content-Type', media.contentType);
        res.setHeader('Cache-Control', 'private, max-age=86400');
        media.stream.pipe(res);
    }

    @Get(':id/route')
    async routeToRequest(@Req() req: any, @Param('id') id: string) {
        const volunteerId = req.user.sub;
        const result = await this.helpRequestsService.getRouteToRequest(id, volunteerId);
        return {
            success: true,
            data: result,
        };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const request = await this.helpRequestsService.getRequestById(id);
        return {
            success: true,
            data: request,
        };
    }

    // ──────────────────────────────────────────────
    // PATCH /help-requests/:id/accept
    // Volunteer accepts an open request
    // ──────────────────────────────────────────────

    @Patch(':id/accept')
    async accept(@Req() req: any, @Param('id') id: string) {
        const volunteerId = req.user.sub;
        const role = req.user.role;

        if (role !== 'volunteer' && role !== 'admin') {
            throw new BadRequestException('Only verified volunteers can accept help requests');
        }

        const request = await this.helpRequestsService.acceptRequest(id, volunteerId);
        return {
            success: true,
            message: 'Help request accepted',
            data: request,
        };
    }

    // ──────────────────────────────────────────────
    // PATCH /help-requests/:id/resolve
    // Mark request as resolved (owner or accepting volunteer)
    // ──────────────────────────────────────────────

    @Patch(':id/resolve')
    async resolve(@Req() req: any, @Param('id') id: string) {
        const userId = req.user.sub;
        const request = await this.helpRequestsService.resolveRequest(id, userId);
        return {
            success: true,
            message: 'Help request resolved',
            data: request,
        };
    }

    @Patch(':id/release')
    async release(@Req() req: any, @Param('id') id: string) {
        const request = await this.helpRequestsService.resolveRequest(id, req.user.sub);
        return {
            success: true,
            message: 'Help request released',
            data: request,
        };
    }

    @Patch(':id/cancel')
    async cancel(@Req() req: any, @Param('id') id: string) {
        const request = await this.helpRequestsService.cancelRequest(id, req.user.sub);
        return { success: true, message: 'Help request cancelled', data: request };
    }

    @Delete(':id/history')
    async hideFromHistory(@Req() req: any, @Param('id') id: string) {
        await this.helpRequestsService.hideFromParticipantHistory(id, req.user.sub);
        return { success: true, message: 'Request removed from your history' };
    }

    @Post(':id/rating')
    async rate(@Req() req: any, @Param('id') id: string, @Body() dto: RateHelpRequestDto) {
        const result = await this.helpRequestsService.rateRequest(id, req.user.sub, dto);
        return {
            success: true,
            message: 'Volunteer rated',
            data: result,
        };
    }

    private resolveBaseUrl(req: any) {
        const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
        if (configuredBaseUrl) {
            return configuredBaseUrl.replace(/\/$/, '');
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        return `${protocol}://${host}`;
    }
}
