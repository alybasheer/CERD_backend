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
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { SendCommunityMessageDto } from './dto/send-community-message.dto';

@Controller('communities')
@UseGuards(JwtAuthGuard)
export class CommunitiesController {
    constructor(private readonly communitiesService: CommunitiesService) {}

    @Post()
    async create(@Req() req: any, @Body() dto: CreateCommunityDto) {
        this.ensureVolunteerOrAdmin(req.user.role);
        const community = await this.communitiesService.create(req.user.sub, dto);

        return {
            success: true,
            message: 'Community created',
            data: community,
        };
    }

    @Get()
    async findAll(
        @Query('category') category?: string,
        @Query('status') status?: string,
        @Query('lat') lat?: string,
        @Query('lng') lng?: string,
        @Query('radius') radius?: string,
    ) {
        const latitude = lat ? parseFloat(lat) : undefined;
        const longitude = lng ? parseFloat(lng) : undefined;
        const radiusKm = radius ? parseFloat(radius) : undefined;

        if ((lat || lng) && (latitude === undefined || longitude === undefined || isNaN(latitude) || isNaN(longitude))) {
            throw new BadRequestException('lat and lng must be valid numbers');
        }

        const communities = await this.communitiesService.findAll({
            category,
            status,
            latitude,
            longitude,
            radiusKm,
        });

        return {
            success: true,
            message: `Found ${communities.length} communit${communities.length === 1 ? 'y' : 'ies'}`,
            data: communities,
        };
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const community = await this.communitiesService.findById(id);
        return {
            success: true,
            data: community,
        };
    }

    @Get('joined/history')
    async joinedHistory(@Req() req: any) {
        const communities = await this.communitiesService.findJoinedHistory(req.user.sub);
        return { success: true, data: communities };
    }

    @Post(':id/join')
    async join(@Req() req: any, @Param('id') id: string) {
        this.ensureVolunteerOrAdmin(req.user.role);
        const community = await this.communitiesService.join(id, req.user.sub);

        return {
            success: true,
            message: 'Joined community',
            data: community,
        };
    }

    @Patch(':id/start')
    async start(@Req() req: any, @Param('id') id: string) {
        const community = await this.communitiesService.start(id, req.user.sub, req.user.role);

        return {
            success: true,
            message: 'Community started',
            data: community,
        };
    }

    @Delete(':id')
    async remove(@Req() req: any, @Param('id') id: string) {
        const result = await this.communitiesService.remove(id, req.user.sub, req.user.role);

        return {
            success: true,
            message: 'Community deleted',
            data: result,
        };
    }

    @Delete(':id/history')
    async hideHistory(@Req() req: any, @Param('id') id: string) {
        const community = await this.communitiesService.hideForMember(id, req.user.sub);
        return { success: true, message: 'Community removed from your history', data: community };
    }

    @Get(':id/messages')
    async getMessages(@Req() req: any, @Param('id') id: string) {
        const messages = await this.communitiesService.getMessages(id, req.user.sub, req.user.role);

        return {
            success: true,
            data: messages,
        };
    }

    @Post(':id/messages')
    async sendMessage(@Req() req: any, @Param('id') id: string, @Body() dto: SendCommunityMessageDto) {
        const message = await this.communitiesService.sendMessage(id, req.user.sub, req.user.role, dto);

        return {
            success: true,
            message: 'Message sent',
            data: message,
        };
    }

    private ensureVolunteerOrAdmin(role: string) {
        if (role !== 'volunteer' && role !== 'admin') {
            throw new BadRequestException('Only volunteers can use community actions');
        }
    }
}
